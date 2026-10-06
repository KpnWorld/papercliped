import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store } from "../oauth/store.js";
import { tools } from "../tools.js";
import { buildPublicOpenApi } from "./openapi.js";
import { assessHealth, BRIDGE_SILENT_MS, latestPerNode } from "./health.js";
import {
  AUTH_FAILURE_REASONS,
  ERROR_CLASSES,
  PUBLIC_SCHEMA_VERSION,
  PUBLIC_WINDOWS,
  type AuthFailureReason,
  type ErrorClass,
  type PublicErrors,
  type PublicInfo,
  type PublicSeries,
  type PublicStats,
  type PublicStatus,
  type PublicWindow,
  type ServiceStatus,
} from "./types.js";

/** Only the read methods the public API needs. */
export type PublicStore = Pick<Store, "auditTotals" | "auditSeries" | "auditBreakdown" | "auditActiveUsers" | "userEventCounts" | "userEventSeries" | "countAccounts" | "liveGrantCount" | "nodeSamples" | "hit">;

export interface PublicApiOptions {
  store: PublicStore;
  version: string;
  docsUrl: string;
  /** Public origin for the OpenAPI servers entry. */
  publicUrl?: string;
  /** Number of trusted reverse proxies in front of the bridge (for the client address used by the rate limit). */
  proxyHops?: number;
  /** p95 above this marks the service degraded (3x = down). */
  slowMs?: number;
  now?: () => number;
  startedAt?: number;
}

const WINDOW_SPEC: Record<PublicWindow, { span: number; bucket: number }> = {
  "1h": { span: 3_600_000, bucket: 300_000 }, // 12 buckets of 5 minutes
  "24h": { span: 86_400_000, bucket: 3_600_000 }, // 24 hourly buckets
  "7d": { span: 7 * 86_400_000, bucket: 6 * 3_600_000 }, // 28 buckets of 6 hours
};
const CACHE_MS = 30_000;
const RATE_PER_MIN = 60;
const TOOL_NAMES = new Set(tools.map((t) => t.name));
const iso = (ms: number) => new Date(ms).toISOString();
const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

const ENDPOINTS: PublicInfo["endpoints"] = [
  { path: "/api/public/v1/info", description: "This document: version, endpoints, limits." },
  { path: "/api/public/v1/openapi.json", description: "OpenAPI description of this public API." },
  { path: "/api/public/v1/status", description: "Is the service up: ok, degraded or down." },
  { path: "/api/public/v1/stats?window=1h|24h|7d", description: "Aggregate users, connections, sign-ins, requests, errors and load." },
  { path: "/api/public/v1/series?window=1h|24h|7d", description: "The same numbers over time, in fixed buckets." },
  { path: "/api/public/v1/errors?window=1h|24h|7d", description: "Error mix by class and sign-in failures by reason." },
  { path: "/api/public/stats", description: "Legacy: total users and live connections." },
];

/**
 * GET /api/public/v1/*: system-level numbers anyone may read. Aggregate only (see types.ts), cached for 30 s, rate-limited
 * per client address, CORS-open for GET with no credentials.
 */
export class PublicApiRoutes {
  private now: () => number;
  private startedAt: number;
  private cache = new Map<string, { at: number; body: unknown }>();

  constructor(private o: PublicApiOptions) {
    this.now = o.now ?? Date.now;
    this.startedAt = o.startedAt ?? this.now();
  }

  private ip(req: IncomingMessage): string {
    const hops = this.o.proxyHops ?? 0;
    if (hops > 0) {
      const parts = String(req.headers["x-forwarded-for"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      if (parts.length >= hops) return parts[parts.length - hops];
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  private send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): true {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": status === 200 ? `public, max-age=${CACHE_MS / 1000}` : "no-store",
      ...extra,
    });
    res.end(JSON.stringify(body));
    return true;
  }

  private async cached<T>(key: string, build: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.body as T;
    const body = await build();
    this.cache.set(key, { at: this.now(), body });
    return body;
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname.replace(/\/+$/, "");
    if (!path.startsWith("/api/public/v1")) return false;
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" });
      res.end();
      return true;
    }
    if (req.method !== "GET" && req.method !== "HEAD") return this.send(res, 405, { error: "Only GET is allowed" }, { Allow: "GET, OPTIONS" });
    if (!(await this.o.store.hit(`pubapi:${this.ip(req)}`, RATE_PER_MIN, 60_000))) return this.send(res, 429, { error: `Rate limit: ${RATE_PER_MIN} requests per minute` }, { "Retry-After": "60" });

    const route = path.slice("/api/public/v1".length) || "/";
    const w = url.searchParams.get("window") ?? "24h";
    const needsWindow = route === "/stats" || route === "/series" || route === "/errors";
    if (needsWindow && !(PUBLIC_WINDOWS as readonly string[]).includes(w)) return this.send(res, 400, { error: `window must be one of ${PUBLIC_WINDOWS.join(", ")}` });
    const win = w as PublicWindow;
    try {
      if (route === "/info") return this.send(res, 200, this.info());
      if (route === "/openapi.json") return this.send(res, 200, buildPublicOpenApi(this.o.publicUrl ?? `${url.protocol}//${req.headers.host ?? "localhost"}`, this.o.version));
      if (route === "/status") return this.send(res, 200, await this.cached("status", () => this.status()));
      if (route === "/stats") return this.send(res, 200, await this.cached(`stats:${win}`, () => this.stats(win)));
      if (route === "/series") return this.send(res, 200, await this.cached(`series:${win}`, () => this.series(win)));
      if (route === "/errors") return this.send(res, 200, await this.cached(`errors:${win}`, () => this.errors(win)));
    } catch {
      return this.send(res, 503, { error: "Statistics are temporarily unavailable" });
    }
    return this.send(res, 404, { error: "Not found", endpoints: ENDPOINTS.map((e) => e.path) });
  }

  info(): PublicInfo {
    return { schemaVersion: PUBLIC_SCHEMA_VERSION, service: "papercliped", version: this.o.version, docs: this.o.docsUrl, endpoints: ENDPOINTS, windows: PUBLIC_WINDOWS, rateLimit: { requestsPerMinute: RATE_PER_MIN }, cacheSeconds: CACHE_MS / 1000 };
  }

  private uptime = () => Math.max(0, Math.round((this.now() - this.startedAt) / 1000));

  /** Service health over the last hour, from tool-call totals and the bridges' own health reports. */
  private async health(): Promise<{ status: ServiceStatus; load: PublicStats["load"] }> {
    const to = this.now() + 1;
    const [totals, samples] = await Promise.all([this.o.store.auditTotals("tool", to - 3_600_000, to), this.o.store.nodeSamples(to - 15 * 60_000)]);
    const nodes = latestPerNode(samples, this.now());
    const fresh = nodes.filter((n) => n.ageMs <= BRIDGE_SILENT_MS);
    const h = assessHealth({
      count: totals.count,
      faults: totals.faults,
      p95: totals.p95,
      dbPingMs: nodes[0]?.dbPingMs ?? null,
      loopLagP99Ms: Math.max(0, ...fresh.map((n) => n.loopLagP99Ms)),
      slowMs: this.o.slowMs ?? 2000,
      recentDbFailed: samples.slice(0, 3).length > 0 && samples.slice(0, 3).every((x) => x.dbPingMs == null),
      bridgeSilentMs: nodes.length ? Math.min(...nodes.map((n) => n.ageMs)) : null,
    });
    // This process is answering, so "no bridge has reported yet" (e.g. a fresh start) is not an outage.
    const status: ServiceStatus = h.state === "critical" ? "down" : h.state === "degraded" && !(h.reasons.length === 1 && h.reasons[0].startsWith("no bridge")) ? "degraded" : "ok";
    const lead = fresh[0];
    return { status, load: { eventLoopLagP99Ms: lead ? Math.round(lead.loopLagP99Ms) : null, dbPingMs: lead?.dbPingMs != null ? Math.round(lead.dbPingMs) : null, memoryMb: lead ? Math.round(lead.rssMb) : null, bridgesReporting: fresh.length } };
  }

  async status(): Promise<PublicStatus> {
    return { schemaVersion: PUBLIC_SCHEMA_VERSION, status: (await this.health()).status, version: this.o.version, uptimeSeconds: this.uptime(), checkedAt: iso(this.now()) };
  }

  private failuresByReason(failures: Record<string, number>): Record<AuthFailureReason, number> {
    const out = zero(AUTH_FAILURE_REASONS);
    for (const [key, n] of Object.entries(failures)) {
      const reason = key.split(":")[1] as AuthFailureReason;
      out[(AUTH_FAILURE_REASONS as readonly string[]).includes(reason) ? reason : "other"] += n;
    }
    return out;
  }

  private byClass(rows: { key: string; count: number }[]): Record<ErrorClass, number> {
    const out = zero(ERROR_CLASSES);
    for (const r of rows) out[(ERROR_CLASSES as readonly string[]).includes(r.key) ? (r.key as ErrorClass) : "other"] += r.count;
    return out;
  }

  async stats(win: PublicWindow): Promise<PublicStats> {
    const { span } = WINDOW_SPEC[win];
    const to = this.now() + 1;
    const from = to - span;
    const S = this.o.store;
    const [totals, byTool, toolErrors, httpErrors, users, active, counts, live, health] = await Promise.all([
      S.auditTotals("tool", from, to),
      S.auditBreakdown("tool", "name", from, to, 100),
      S.auditBreakdown("tool", "errorClass", from, to, 50),
      S.auditBreakdown("http", "errorClass", from, to, 50),
      S.countAccounts(),
      S.auditActiveUsers(from, to),
      S.userEventCounts(from, to),
      S.liveGrantCount(),
      this.health(),
    ]);
    const started = counts.byKind.started ?? 0;
    const completed = counts.byKind.completed ?? 0;
    const failures = this.failuresByReason(counts.failures);
    const failed = Object.values(failures).reduce((a, b) => a + b, 0);
    const errorClasses = this.byClass([...toolErrors.filter((r) => r.key && r.key !== "null").map((r) => ({ key: r.key, count: r.errors || r.count })), ...httpErrors.filter((r) => r.key && r.key !== "null").map((r) => ({ key: r.key, count: r.errors || r.count }))]);
    const tools: Record<string, number> = {};
    for (const r of byTool) if (TOOL_NAMES.has(r.key)) tools[r.key] = r.count; // only catalogue names, never other keys
    return {
      schemaVersion: PUBLIC_SCHEMA_VERSION,
      window: win,
      windowSeconds: span / 1000,
      generatedAt: iso(this.now()),
      service: { version: this.o.version, uptimeSeconds: this.uptime(), status: health.status },
      users: { total: users, active, new: counts.byKind.joined ?? 0 },
      connections: { live },
      auth: { flowsStarted: started, flowsCompleted: completed, flowsFailed: failed, successRate: started > 0 ? Math.min(1, completed / started) : null, failuresByReason: failures },
      requests: {
        count: totals.count,
        errors: totals.errors,
        faults: totals.faults,
        successRate: totals.count ? (totals.count - totals.errors) / totals.count : null,
        latencyMs: { p50: Math.round(totals.p50), p95: Math.round(totals.p95), p99: Math.round(totals.p99) },
        callsPerMinute: Math.round((totals.count / (span / 60_000)) * 100) / 100,
        byTool: tools,
      },
      errors: { total: Object.values(errorClasses).reduce((a, b) => a + b, 0), byClass: errorClasses },
      load: health.load,
    };
  }

  async series(win: PublicWindow): Promise<PublicSeries> {
    const { span, bucket } = WINDOW_SPEC[win];
    const to = this.now() + 1;
    const from = to - span;
    const [calls, flows] = await Promise.all([this.o.store.auditSeries("tool", from, to, bucket), this.o.store.userEventSeries(from, to, bucket)]);
    const start = Math.floor(from / bucket) * bucket;
    const buckets = [];
    for (let t = start; t < to; t += bucket) {
      const c = calls.find((x) => x.t === t);
      const f = flows.find((x) => x.t === t);
      buckets.push({ t: iso(t), requests: c?.count ?? 0, errors: c?.errors ?? 0, faults: c?.faults ?? 0, p95Ms: Math.round(c?.p95 ?? 0), authCompleted: f?.completed ?? 0, authFailed: f?.failed ?? 0, newUsers: f?.joined ?? 0 });
    }
    return { schemaVersion: PUBLIC_SCHEMA_VERSION, window: win, bucketSeconds: bucket / 1000, generatedAt: iso(this.now()), buckets };
  }

  async errors(win: PublicWindow): Promise<PublicErrors> {
    const s = await this.cached(`stats:${win}`, () => this.stats(win));
    return { schemaVersion: PUBLIC_SCHEMA_VERSION, window: win, generatedAt: s.generatedAt, requests: s.requests.count, errorRate: s.requests.count ? s.requests.errors / s.requests.count : null, byClass: s.errors.byClass, authFailuresByReason: s.auth.failuresByReason };
  }
}
