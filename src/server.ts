import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { PaperclipClient } from "./client.js";
import type { BridgeConfig, HttpConfig } from "./config.js";
import { executeTool, type AuditEvent, type ExecOptions } from "./execute.js";
import { createMcpServer } from "./mcp.js";
import { safeEqual } from "./oauth/crypto.js";
import { OAuthProvider } from "./oauth/provider.js";
import { buildOpenApi } from "./openapi.js";

const MAX_BODY_BYTES = 1_000_000;

export interface ServerOptions {
  client?: PaperclipClient;
  /** Inject a provider (tests). Created from `http.oauth` otherwise. */
  oauth?: OAuthProvider | null;
  /** Audit sink. Default: one JSON line per tool call on stderr. */
  audit?: (e: AuditEvent) => void;
}

const stderrAudit = (e: AuditEvent) => process.stderr.write(`${JSON.stringify({ audit: e })}\n`);

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Body too large"), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}

/** Who is calling the protected endpoints. */
type Principal = { kind: "static" } | { kind: "oauth"; grantId: string; client: string; userId: string | null; scopes: string[]; paperclip: PaperclipClient };

export function createHttpServer(config: BridgeConfig, http: HttpConfig, opts: ServerOptions = {}): Server {
  const baseClient = opts.client ?? new PaperclipClient(config);
  const audit = opts.audit ?? stderrAudit;
  const oauth =
    opts.oauth !== undefined ? opts.oauth : http.oauth ? new OAuthProvider({ config, oauth: http.oauth, bridgeToken: http.bridgeToken }) : null;

  function authenticate(req: IncomingMessage): Principal | null {
    const m = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "");
    if (!m) return null;
    const token = m[1].trim();
    if (http.bridgeToken && safeEqual(token, http.bridgeToken)) return { kind: "static" };
    const grant = oauth?.authenticate(token);
    if (!grant || !oauth) return null;
    return { kind: "oauth", grantId: grant.id, client: grant.clientName, userId: grant.userId, scopes: grant.scopes, paperclip: oauth.clientFor(grant) };
  }

  const execFor = (p: Principal): { client: PaperclipClient; exec: ExecOptions } =>
    p.kind === "static"
      ? { client: baseClient, exec: { actor: { id: "static-token" }, audit } }
      : { client: p.paperclip, exec: { scopes: p.scopes, actor: { id: p.grantId, client: p.client, userId: p.userId }, audit } };

  const unauthorized = (res: ServerResponse, invalid: boolean) => {
    const challenge = oauth ? oauth.challengeHeader(invalid ? "invalid_token" : undefined) : "Bearer";
    json(res, 401, { error: invalid ? "Invalid or expired token" : "Missing or invalid bearer token" }, { "WWW-Authenticate": challenge });
  };

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://bridge");
      const path = url.pathname;

      if (path === "/healthz") return json(res, 200, { ok: true, readOnly: config.readOnly, oauth: !!oauth });

      if (path === "/openapi.json" && req.method === "GET") {
        const host = req.headers.host ?? `${http.host}:${http.port}`;
        return json(res, 200, buildOpenApi(http.oauth?.issuer ?? http.publicUrl ?? `http://${host}`));
      }

      if (oauth && (await oauth.handle(req, res, url))) return;

      const principal = authenticate(req);
      if (!principal) return unauthorized(res, !!req.headers.authorization);
      const { client, exec } = execFor(principal);

      // Stateless Streamable HTTP: a fresh server+transport per request, so no session affinity is needed.
      if (path === "/mcp") {
        const server = createMcpServer(config, client, exec);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        const body = req.method === "POST" ? await readBody(req) : undefined;
        return await transport.handleRequest(req, res, body);
      }

      const action = /^\/actions\/([a-z0-9_]+)$/.exec(path);
      if (action && req.method === "POST") {
        const out = await executeTool(client, action[1], await readBody(req), exec);
        if (out.ok) return json(res, 200, out.result);
        const extra: Record<string, string> = {};
        const needed = (out.error as any)?.insufficient_scope;
        if (out.status === 403 && needed && oauth) extra["WWW-Authenticate"] = oauth.challengeHeader("insufficient_scope", needed);
        return json(res, out.status, { error: out.error }, extra);
      }

      return json(res, 404, { error: "Not found" });
    } catch (err: any) {
      if (!res.headersSent) json(res, err?.status ?? 500, { error: err?.message ?? "Internal error" });
    }
  });
}
