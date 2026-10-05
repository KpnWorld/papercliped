import { PaperclipApiError, PaperclipClient } from "./client.js";
import { requiredScope, scopeAllows, type Scope } from "./oauth/scopes.js";
import { toolsByName, type ToolDef } from "./tools.js";

export class ToolInputError extends Error {}

export function isMutation(tool: ToolDef, input: Record<string, unknown>): boolean {
  if (tool.name === "paperclip_api_request") return input.method !== "GET";
  return tool.access !== "read";
}

export interface AuditEvent {
  ts: string;
  tool: string;
  mutation: boolean;
  ok: boolean;
  status?: number;
  /** Who called: a grant id for OAuth clients, "static-token" for BRIDGE_TOKEN, "stdio" otherwise. */
  actor: string;
  client?: string;
  userId?: string | null;
}

export interface ExecOptions {
  /** When set, the caller is limited to these scopes. Omitted = unrestricted (stdio / static token). */
  scopes?: readonly string[];
  actor?: { id: string; client?: string; userId?: string | null };
  audit?: (e: AuditEvent) => void;
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; status: number; error: unknown };

/** Validate, enforce scopes + read-only mode, run, audit. Never throws: callers map the outcome to their protocol. */
export async function executeTool(
  client: PaperclipClient,
  name: string,
  rawInput: unknown,
  opts: ExecOptions = {},
): Promise<ToolOutcome> {
  const tool = toolsByName.get(name);
  if (!tool) return { ok: false, status: 404, error: `Unknown tool: ${name}` };

  let mutation = tool.access !== "read";
  const done = (out: ToolOutcome): ToolOutcome => {
    opts.audit?.({
      ts: new Date().toISOString(),
      tool: name,
      mutation,
      ok: out.ok,
      status: out.ok ? undefined : out.status,
      actor: opts.actor?.id ?? "stdio",
      client: opts.actor?.client,
      userId: opts.actor?.userId,
    });
    return out;
  };

  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return done({ ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") });
  }
  mutation = isMutation(tool, parsed.data);
  if (opts.scopes) {
    const needed: Scope = requiredScope(tool, parsed.data);
    if (!scopeAllows(opts.scopes, needed)) {
      return done({ ok: false, status: 403, error: { message: `This connection lacks the ${needed} scope required for ${name}. Reconnect and grant a higher access level.`, insufficient_scope: needed } });
    }
  }
  if (client.config.readOnly && mutation) {
    return done({ ok: false, status: 403, error: "Bridge is in read-only mode (PAPERCLIP_READ_ONLY); this action was not sent to Paperclip." });
  }
  try {
    return done({ ok: true, result: await tool.run(client, parsed.data) });
  } catch (err) {
    if (err instanceof PaperclipApiError) {
      const hint = err.status === 401 && opts.actor ? " The Paperclip credential behind this connection was rejected; disconnect and reconnect the connector." : "";
      return done({ ok: false, status: err.status, error: { message: err.message + hint, status: err.status, body: err.body } });
    }
    return done({ ok: false, status: 500, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Text shown to a chat model: reports render as markdown, everything else as JSON. */
export function renderForModel(result: unknown): string {
  if (result && typeof result === "object" && typeof (result as any).markdown === "string") {
    return (result as any).markdown;
  }
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}
