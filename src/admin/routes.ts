import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { safeEqual, randomToken } from "../oauth/crypto.js";
import type { SystemSampler, AuditRecorder } from "../telemetry/recorder.js";
import type { AuditRow, AuditStore } from "../telemetry/types.js";
import { adminPage, loginPage } from "./page.js";

export interface AdminDeps {
  token: string;
  sessionHours: number;
  secureCookie: boolean;
  store: AuditStore & { hit(key: string, limit: number, windowMs: number): Promise<boolean> };
  recorder: AuditRecorder;
  sampler: SystemSampler;
  slowMs: number;
  /** Live connection count (cached by the caller if expensive). */
  liveGrants?: () => Promise<number | null>;
  mode: string;
  persistent: boolean;
  proxyHops?: number;
  now?: () => number;
}

/** window → [span ms, bucket ms] */
export const WINDOWS: Record<string, [number, number]> = {
  "5m": [5 * 60_000, 5_000],
  "15m": [15 * 60_000, 15_000],
  "1h": [3_600_000, 60_000],
  "6h": [6 * 3_600_000, 300_000],
  "24h": [24 * 3_600_000, 900_000],
  "7d": [7 * 24 * 3_600_000, 3_600_000],
};

export type Health = { state: "healthy" | "degraded" | "critical" | "idle"; reasons: string[] };

export function assessHealth(i: { count: number; faults: number; p95: number; dbPingMs: number | null; dbFailures: number; loopLagP99Ms: number; slowMs: number; recentDbFailed: boolean }): Health {
  const reasons: string[] = [];
  let level = 0;
  const bump = (l: number, why: string) => {
    level = Math.max(level, l);
    reasons.push(why);
  };
  const faultRate = i.count ? i.faults / i.count : 0;
  if (i.count >= 5) {
    if (faultRate >= 0.1) bump(2, `${(faultRate * 100).toFixed(1)}% of calls hit a system fault`);
    else if (faultRate >= 0.02) bump(1, `${(faultRate * 100).toFixed(1)}% of calls hit a system fault`);
    if (i.p95 >= i.slowMs * 3) bump(2, `p95 latency ${Math.round(i.p95)} ms`);
    else if (i.p95 >= i.slowMs) bump(1, `p95 latency ${Math.round(i.p95)} ms`);
  }
  if (i.recentDbFailed) bump(2, "database ping is failing");
  else if (i.dbPingMs != null && i.dbPingMs >= 1000) bump(2, `database ping ${Math.round(i.dbPingMs)} ms`);
  else if (i.dbPingMs != null && i.dbPingMs >= 250) bump(1, `database ping ${Math.round(i.dbPingMs)} ms`);
  if (i.loopLagP99Ms >= 500) bump(2, `event-loop lag p99 ${Math.round(i.loopLagP99Ms)} ms`);
  else if (i.loopLagP99Ms >= 100) bump(1, `event-loop lag p99 ${Math.round(i.loopLagP99Ms)} ms`);
  if (level === 0) return { state: i.count === 0 ? "idle" : "healthy", reasons: i.count === 0 ? ["no calls in this window"] : [] };
  return { state: level === 2 ? "critical" : "degraded", reasons };
}

const COOKIE = "pcb_admin";

export class AdminRoutes {
  private key: Buffer;
  private now: () => number;
  private grantsCache: { at: number; v: number | null } = { at: 0, v: null };

  constructor(private d: AdminDeps) {
    this.key = Buffer.from(hkdfSync("sha256", d.token, "paperclip-bridge", "admin-session-v1", 32));
    this.now = d.now ?? Date.now;
  }

  private sign(expSec: number): string {
    return `${expSec}.${createHmac("sha256", this.key).update(`admin|${expSec}`).digest("base64url")}`;
  }

  private sessionValid(req: IncomingMessage): boolean {
    const m = new RegExp(`(?:^|; )${COOKIE}=([^;]+)`).exec(req.headers.cookie ?? "");
    if (!m) return false;
    const [exp, mac] = m[1].split(".");
    const expSec = Number(exp);
    if (!Number.isFinite(expSec) || expSec * 1000 < this.now() || !mac) return false;
    const want = Buffer.from(this.sign(expSec).split(".")[1]);
    const got = Buffer.from(mac);
    return want.length === got.length && timingSafeEqual(want, got);
  }

  private ip(req: IncomingMessage): string {
    const hops = this.d.proxyHops ?? 0;
    if (hops > 0) {
      const parts = String(req.headers["x-forwarded-for"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      if (parts.length >= hops) return parts[parts.length - hops];
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  private send(res: ServerResponse, status: number, body: string, type: string, extra: Record<string, string> = {}): true {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...extra });
    res.end(body);
    return true;
  }

  private json = (res: ServerResponse, status: number, body: unknown) => this.send(res, status, JSON.stringify(body), "application/json");

  private html(res: ServerResponse, status: number, build: (nonce: string) => string, extra: Record<string, string> = {}): true {
    const nonce = randomToken(12);
    return this.send(res, status, build(nonce), "text/html; charset=utf-8", {
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      "X-Frame-Options": "DENY",
      ...extra,
    });
  }

  private cookie(value: string, maxAgeSec: number): string {
    return `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${this.d.secureCookie ? "; Secure" : ""}`;
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (p !== "/admin" && !p.startsWith("/admin/")) return false;
    const m = req.method ?? "GET";

    if (m === "POST" && p === "/admin/login") return this.login(req, res);
    if (m === "POST" && p === "/admin/logout") return this.send(res, 303, "", "text/plain", { Location: "/admin", "Set-Cookie": this.cookie("", 0) });

    const authed = this.sessionValid(req);
    if (m === "GET" && (p === "/admin" || p === "/admin/")) {
      return authed ? this.html(res, 200, (n) => adminPage(n, { slowMs: this.d.slowMs })) : this.html(res, 200, (n) => loginPage(n));
    }
    if (!authed) return this.json(res, 401, { error: "Sign in at /admin" });
    if (m === "GET" && p === "/admin/api/summary") return this.summary(res, url);
    if (m === "GET" && p === "/admin/api/events") return this.events(res, url);
    return this.json(res, 404, { error: "Not found" });
  }

  private async login(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.d.store.hit(`admin-login:${this.ip(req)}`, 5, 60_000))) {
      return this.html(res, 429, (n) => loginPage(n, "Too many attempts. Wait a minute."));
    }
    let body = "";
    for await (const c of req) {
      body += c;
      if (body.length > 4096) break;
    }
    const token = new URLSearchParams(body).get("token") ?? "";
    if (!safeEqual(token, this.d.token)) return this.html(res, 401, (n) => loginPage(n, "Incorrect token."));
    const maxAge = this.d.sessionHours * 3600;
    const expSec = Math.floor(this.now() / 1000) + maxAge;
    return this.send(res, 303, "", "text/plain", { Location: "/admin", "Set-Cookie": this.cookie(this.sign(expSec), maxAge) });
  }

  private async grants(): Promise<number | null> {
    if (!this.d.liveGrants) return null;
    if (this.now() - this.grantsCache.at > 10_000) {
      this.grantsCache = { at: this.now(), v: await this.d.liveGrants().catch(() => null) };
    }
    return this.grantsCache.v;
  }

  private async summary(res: ServerResponse, url: URL): Promise<true> {
    const win = url.searchParams.get("window") ?? "15m";
    const spec = WINDOWS[win];
    if (!spec) return this.json(res, 400, { error: `window must be one of ${Object.keys(WINDOWS).join(", ")}` });
    const [span, bucketMs] = spec;
    const to = this.now() + 1; // include events stamped in this very millisecond
    const from = to - span;
    const S = this.d.store;
    try {
      const [totals, prev, series, histogram, byTool, byInstance, byError, slowest, httpTotals, httpByRoute, httpSeries, live] = await Promise.all([
        S.auditTotals("tool", from, to),
        S.auditTotals("tool", from - span, from),
        S.auditSeries("tool", from, to, bucketMs),
        S.auditHistogram("tool", from, to),
        S.auditBreakdown("tool", "name", from, to, 30),
        S.auditBreakdown("tool", "instance", from, to, 50),
        S.auditBreakdown("tool", "errorClass", from, to, 20),
        S.auditSlowest("tool", from, to, 8),
        S.auditTotals("http", from, to),
        S.auditBreakdown("http", "name", from, to, 20),
        S.auditSeries("http", from, to, bucketMs),
        this.grants(),
      ]);
      const system = this.d.sampler.snapshot();
      const rec = this.d.recorder.stats();
      const health = assessHealth({
        count: totals.count,
        faults: totals.faults,
        p95: totals.p95,
        dbPingMs: system.dbPingMs,
        dbFailures: system.dbFailures,
        loopLagP99Ms: system.loopLagP99Ms,
        slowMs: this.d.slowMs,
        recentDbFailed: system.recentPing.slice(-3).length > 0 && system.recentPing.slice(-3).every((x) => x == null),
      });
      return this.json(res, 200, {
        window: win,
        from,
        to,
        bucketMs,
        slowMs: this.d.slowMs,
        generatedAt: this.now(),
        health,
        totals,
        previous: prev,
        series,
        histogram,
        byTool,
        byInstance,
        byError,
        slowest: slowest.map(rowJson),
        http: { totals: httpTotals, byRoute: httpByRoute, series: httpSeries },
        system: { ...system, node: this.d.recorder.node, mode: this.d.mode, persistent: this.d.persistent, liveGrants: live },
        recorder: rec,
      });
    } catch (e) {
      return this.json(res, 500, { error: `Could not read telemetry: ${(e as Error).message}` });
    }
  }

  private async events(res: ServerResponse, url: URL): Promise<true> {
    const after = Math.max(0, Number(url.searchParams.get("after")) || 0);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const k = url.searchParams.get("kind");
    const kind = k === "http" ? "http" : k === "all" ? undefined : "tool"; // the live tail is about tool calls; HTTP housekeeping has its own table
    try {
      return this.json(res, 200, { events: (await this.d.store.auditRecent(after, limit, kind)).map(rowJson) });
    } catch (e) {
      return this.json(res, 500, { error: `Could not read events: ${(e as Error).message}` });
    }
  }
}

function rowJson(r: AuditRow) {
  return {
    id: r.id,
    at: r.at,
    kind: r.kind,
    name: r.name,
    mutation: r.mutation,
    ok: r.ok,
    status: r.status,
    errorClass: r.errorClass,
    totalMs: r.totalMs,
    upstreamMs: r.upstreamMs,
    upstreamCalls: r.upstreamCalls,
    scope: r.scope,
    client: r.client,
    instance: r.instance,
    node: r.node,
  };
}
