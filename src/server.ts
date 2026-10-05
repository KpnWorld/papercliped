import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { PaperclipClient } from "./client.js";
import { readConfig, readHttpConfig, type BridgeConfig, type HttpConfig } from "./config.js";
import { executeTool } from "./execute.js";
import { createMcpServer } from "./mcp.js";
import { buildOpenApi } from "./openapi.js";

const MAX_BODY_BYTES = 1_000_000;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
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

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createHttpServer(config: BridgeConfig, http: HttpConfig, client = new PaperclipClient(config)): Server {
  const authorized = (req: IncomingMessage) => {
    if (!http.bridgeToken) return false;
    const m = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "");
    return !!m && tokenMatches(m[1], http.bridgeToken);
  };

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://bridge");
      const path = url.pathname;

      if (path === "/healthz") return json(res, 200, { ok: true, readOnly: config.readOnly });

      if (path === "/openapi.json" && req.method === "GET") {
        const host = req.headers.host ?? `${http.host}:${http.port}`;
        return json(res, 200, buildOpenApi(http.publicUrl ?? `http://${host}`));
      }

      if (!authorized(req)) {
        res.setHeader("WWW-Authenticate", "Bearer");
        return json(res, 401, { error: "Missing or invalid bearer token" });
      }

      // Stateless Streamable HTTP: a fresh server+transport per request, so no session affinity is needed.
      if (path === "/mcp") {
        const server = createMcpServer(config, client);
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
        const out = await executeTool(client, action[1], await readBody(req));
        return out.ok ? json(res, 200, out.result) : json(res, out.status, { error: out.error });
      }

      return json(res, 404, { error: "Not found" });
    } catch (err: any) {
      if (!res.headersSent) json(res, err?.status ?? 500, { error: err?.message ?? "Internal error" });
    }
  });
}
