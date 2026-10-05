import type { ToolDef } from "../tools.js";

export const SCOPES = ["paperclip:read", "paperclip:control", "paperclip:admin"] as const;
export type Scope = (typeof SCOPES)[number];

const RANK: Record<Scope, number> = { "paperclip:read": 1, "paperclip:control": 2, "paperclip:admin": 3 };

/** Tools that are `write` by access class but too consequential for the control tier. */
const ADMIN_TOOLS = new Set(["paperclip_decide_approval", "paperclip_set_agent_budget"]);

export const isScope = (s: string): s is Scope => (SCOPES as readonly string[]).includes(s);

/** read < control < admin; each level includes the ones below. */
export function maxRank(granted: readonly string[]): number {
  return Math.max(0, ...granted.filter(isScope).map((s) => RANK[s]));
}

export function requiredScope(tool: Pick<ToolDef, "name" | "access">, input: Record<string, unknown> = {}): Scope {
  if (tool.name === "paperclip_api_request") return input.method === "GET" ? "paperclip:read" : "paperclip:admin";
  if (tool.access === "destructive" || ADMIN_TOOLS.has(tool.name)) return "paperclip:admin";
  return tool.access === "write" ? "paperclip:control" : "paperclip:read";
}

export const scopeAllows = (granted: readonly string[], needed: Scope) => maxRank(granted) >= RANK[needed];

/** Highest-level scope name for a rank, e.g. 2 → paperclip:control. */
export const scopesUpTo = (level: Scope): Scope[] => SCOPES.filter((s) => RANK[s] <= RANK[level]);
