/** One audited event. Never contains tool arguments, responses or credentials. */
export interface AuditEvent {
  ts: string;
  /** Tool name for kind "tool"; route group (e.g. "oauth.token") for kind "http". */
  tool: string;
  kind?: "tool" | "http";
  mutation: boolean;
  ok: boolean;
  status?: number;
  /** Coarse, non-sensitive failure class: invalid_input, insufficient_scope, read_only, upstream_4xx, upstream_5xx, upstream_unreachable, rate_limited, unauthorized, internal. */
  errorClass?: string;
  /** Who called: a grant id for OAuth clients, "static-token" for BRIDGE_TOKEN, "stdio" otherwise. */
  actor: string;
  client?: string;
  userId?: string | null;
  /** Papercliped username (operator-visible only). */
  username?: string;
  /** Tenant's Paperclip host (multi-tenant mode). */
  instance?: string;
  /** Scope the call needed (tool events). */
  scope?: string;
  totalMs?: number;
  /** Wall time spent waiting on Paperclip (union of upstream request intervals). */
  upstreamMs?: number;
  upstreamCalls?: number;
}

export interface AuditRow {
  id?: number;
  at: number;
  node: string;
  kind: "tool" | "http";
  name: string;
  mutation: boolean;
  ok: boolean;
  status: number | null;
  errorClass: string | null;
  totalMs: number;
  upstreamMs: number | null;
  upstreamCalls: number | null;
  scope: string | null;
  grantId: string | null;
  client: string | null;
  instance: string | null;
  userId: string | null;
  username: string | null;
}

/** Errors that mean *the system* misbehaved, as opposed to a caller mistake (bad input, missing scope, ...). */
export const FAULT_CLASSES = ["upstream_5xx", "upstream_unreachable", "internal"] as const;
export const isFault = (c: string | null | undefined) => !!c && (FAULT_CLASSES as readonly string[]).includes(c);

export interface SeriesBucket {
  t: number;
  count: number;
  errors: number;
  faults: number;
  p50: number;
  p95: number;
  p99: number;
  avgUpstream: number;
  avgBridge: number;
}

export interface Totals {
  count: number;
  errors: number;
  faults: number;
  mutations: number;
  p50: number;
  p95: number;
  p99: number;
  upstreamP95: number;
  bridgeP95: number;
}

export interface BreakdownRow {
  key: string;
  count: number;
  errors: number;
  faults: number;
  p50: number;
  p95: number;
  upstreamP95: number;
}

/** Upper edges (ms) of the latency histogram; the last bucket is "≥ last edge". */
export const HIST_EDGES = [25, 50, 100, 200, 400, 800, 1600, 3200];

/** The read side of the audit trail: everything the separate panel is allowed to do. */
export interface AuditReader {
  auditSeries(kind: "tool" | "http", from: number, to: number, bucketMs: number): Promise<SeriesBucket[]>;
  auditTotals(kind: "tool" | "http", from: number, to: number): Promise<Totals>;
  auditBreakdown(kind: "tool" | "http", by: "name" | "instance" | "errorClass" | "username", from: number, to: number, limit: number): Promise<BreakdownRow[]>;
  /** Counts per bucket: [<25, 25–50, …, ≥3200] (length HIST_EDGES.length + 1). */
  auditHistogram(kind: "tool" | "http", from: number, to: number): Promise<number[]>;
  auditSlowest(kind: "tool" | "http", from: number, to: number, limit: number): Promise<AuditRow[]>;
  /** Newest first. With afterId > 0, only rows newer than it. */
  auditRecent(afterId: number, limit: number, kind?: "tool" | "http"): Promise<AuditRow[]>;
  /** Distinct display names (usernames or aliases) that made tool calls in the window. */
  auditActiveUsers(from: number, to: number): Promise<number>;
}

export interface AuditStore extends AuditReader {
  insertAudit(rows: AuditRow[]): Promise<void>;
  pruneAudit(beforeMs: number): Promise<number>;
}
