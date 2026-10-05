import { PaperclipApiError, PaperclipClient } from "./client.js";
import { toolsByName, type ToolDef } from "./tools.js";

export class ToolInputError extends Error {}

export function isMutation(tool: ToolDef, input: Record<string, unknown>): boolean {
  if (tool.name === "paperclip_api_request") return input.method !== "GET";
  return tool.access !== "read";
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; status: number; error: unknown };

/** Validate, enforce read-only mode, run. Never throws: callers map the outcome to their protocol. */
export async function executeTool(
  client: PaperclipClient,
  name: string,
  rawInput: unknown,
): Promise<ToolOutcome> {
  const tool = toolsByName.get(name);
  if (!tool) return { ok: false, status: 404, error: `Unknown tool: ${name}` };

  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  }
  if (client.config.readOnly && isMutation(tool, parsed.data)) {
    return { ok: false, status: 403, error: "Bridge is in read-only mode (PAPERCLIP_READ_ONLY); this action was not sent to Paperclip." };
  }
  try {
    return { ok: true, result: await tool.run(client, parsed.data) };
  } catch (err) {
    if (err instanceof PaperclipApiError) {
      return { ok: false, status: err.status, error: { message: err.message, status: err.status, body: err.body } };
    }
    return { ok: false, status: 500, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Text shown to a chat model: reports render as markdown, everything else as JSON. */
export function renderForModel(result: unknown): string {
  if (result && typeof result === "object" && typeof (result as any).markdown === "string") {
    return (result as any).markdown;
  }
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}
