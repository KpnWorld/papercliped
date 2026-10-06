import type { ToolDef } from "../tools.js";

/**
 * Two levels: Read only and Full control. Full control is every tool, because the point of Papercliped is to run your
 * Paperclip from anywhere, not just to watch it.
 */
export const SCOPES = ["paperclip:read", "paperclip:control"] as const;
export type Scope = (typeof SCOPES)[number];

/** A retired third level. Old grants and apps that still ask for it get Full control. */
export const LEGACY_ADMIN = "paperclip:admin";

const RANK: Record<Scope, number> = { "paperclip:read": 1, "paperclip:control": 2 };

export const isScope = (s: string): s is Scope => (SCOPES as readonly string[]).includes(s);
export const normalizeScope = (s: string): string => (s === LEGACY_ADMIN ? "paperclip:control" : s);
/** Known scopes only, retired names mapped, no duplicates. */
export const normalizeScopes = (list: readonly string[]): Scope[] => [...new Set(list.map(normalizeScope).filter(isScope))];

/** read < control; control includes read. */
export function maxRank(granted: readonly string[]): number {
  return Math.max(0, ...normalizeScopes(granted).map((s) => RANK[s]));
}

/** Reads (and raw GETs) need Read only; anything that changes something needs Full control. */
export function requiredScope(tool: Pick<ToolDef, "name" | "access">, input: Record<string, unknown> = {}): Scope {
  if (tool.name === "paperclip_api_request") return input.method === "GET" ? "paperclip:read" : "paperclip:control";
  return tool.access === "read" ? "paperclip:read" : "paperclip:control";
}

export const scopeAllows = (granted: readonly string[], needed: Scope) => maxRank(granted) >= RANK[needed];

/** The scope list for a level, e.g. control → [read, control]. */
export const scopesUpTo = (level: Scope): Scope[] => SCOPES.filter((s) => RANK[s] <= RANK[level]);

/** Levels the person may choose: always both, because the person is the one granting it. */
export const grantableScopes = (_requestedMax?: Scope): Scope[] => [...SCOPES];
