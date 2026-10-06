import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildOpenApi } from "../src/openapi.js";
import { MemoryStore, type Store } from "../src/oauth/store.js";
import { assessHealth } from "../src/public-api/health.js";
import { PublicApiRoutes } from "../src/public-api/routes.js";
import { AUTH_FAILURE_REASONS, ERROR_CLASSES, PUBLIC_SCHEMA_VERSION } from "../src/public-api/types.js";
import type { AuditRow } from "../src/telemetry/types.js";
import { row as fixtureRow, SECRET, seed } from "./public-api.fixture.js";

let srv: Server, base: string, store: Store, api: PublicApiRoutes;
let t = Date.now();
const now = () => t;
const get = (p: string, headers: Record<string, string> = {}) => fetch(`${base}${p}`, { headers });
const row = (over: Partial<AuditRow>) => fixtureRow(t, over);

beforeAll(async () => {
  store = new MemoryStore();
  await seed(store, t);
  api = new PublicApiRoutes({ store, version: "2.0.0", docsUrl: "https://papercliped.co/docs/public-api", now, startedAt: t - 3_600_000 });
  srv = createServer(async (req, res) => {
    if (!(await api.handle(req, res, new URL(req.url!, "http://x")))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => srv.close());

describe("public API: content", () => {
  it("stats has the documented shape and counts", async () => {
    const r = await get("/api/public/v1/stats?window=1h");
    expect(r.status).toBe(200);
    const s: any = await r.json();
    expect(s.schemaVersion).toBe(PUBLIC_SCHEMA_VERSION);
    expect(s).toMatchObject({ window: "1h", windowSeconds: 3600, service: { version: "2.0.0", status: "down", uptimeSeconds: 3600 }, users: { total: 1, new: 1 }, connections: { live: 1 } });
    // 1 of the 5 seeded calls is a system fault (20%), which the health rules treat as an outage.
    expect(s.auth).toMatchObject({ flowsStarted: 3, flowsCompleted: 1, flowsFailed: 3 });
    expect(s.auth.successRate).toBeCloseTo(1 / 3);
    expect(Object.keys(s.auth.failuresByReason).sort()).toEqual([...AUTH_FAILURE_REASONS].sort());
    expect(s.auth.failuresByReason).toMatchObject({ unreachable: 1, bad_credentials: 1, other: 1 }); // the unknown reason is bucketed, not echoed
    expect(s.requests.count).toBe(5);
    expect(s.requests.byTool).toEqual({ paperclip_list_agents: 3, paperclip_pause_agent: 1 }); // the non-catalogue name is dropped
    expect(Object.keys(s.errors.byClass).sort()).toEqual([...ERROR_CLASSES].sort());
    expect(s.errors.byClass).toMatchObject({ insufficient_scope: 1, upstream_5xx: 1, unauthorized: 1, other: 1 });
    expect(s.load).toMatchObject({ dbPingMs: 12, eventLoopLagP99Ms: 8, memoryMb: 140, bridgesReporting: 1 });
  });

  it("series, errors, status and info", async () => {
    const series: any = await (await get("/api/public/v1/series?window=24h")).json();
    expect(series.bucketSeconds).toBe(3600);
    expect(series.buckets.length).toBeGreaterThanOrEqual(24);
    expect(series.buckets.reduce((a: number, b: any) => a + b.requests, 0)).toBe(5);
    const errs: any = await (await get("/api/public/v1/errors?window=7d")).json();
    expect(errs.errorRate).toBeCloseTo(3 / 5);
    const status: any = await (await get("/api/public/v1/status")).json();
    expect(status).toMatchObject({ schemaVersion: 1, status: "down", version: "2.0.0" }); // 20% faults, see above
    const info: any = await (await get("/api/public/v1/info")).json();
    expect(info.endpoints.map((e: any) => e.path)).toContain("/api/public/v1/stats?window=1h|24h|7d");
    const oa: any = await (await get("/api/public/v1/openapi.json")).json();
    expect(Object.keys(oa.paths)).toContain("/api/public/v1/stats");
    expect(oa.tags[0].name).toBe("public");
  });

  it("never exposes usernames, aliases, ids, hosts, app names or free text", async () => {
    const bodies: string[] = [];
    for (const p of ["/api/public/v1/stats?window=1h", "/api/public/v1/stats?window=24h", "/api/public/v1/stats?window=7d", "/api/public/v1/series?window=1h", "/api/public/v1/series?window=7d", "/api/public/v1/errors?window=24h", "/api/public/v1/status", "/api/public/v1/info", "/api/public/v1/openapi.json"])
      bodies.push(await (await get(p, { "x-forwarded-for": "203.0.113.9" })).text());
    const all = bodies.join("\n");
    for (const s of SECRET) expect(all, s).not.toContain(s);
    expect(all).not.toMatch(/made_up_class|not_a_catalogue/);
  });

  it("the public API is not in the Actions document", () => {
    expect(Object.keys(buildOpenApi("https://x").paths).some((p) => p.startsWith("/api/public"))).toBe(false);
  });
});

describe("public API: behaviour", () => {
  it("CORS for GET without credentials, preflight, and no other methods", async () => {
    const r = await get("/api/public/v1/status");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(r.headers.get("cache-control")).toBe("public, max-age=30");
    const pre = await fetch(`${base}/api/public/v1/stats`, { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect((await fetch(`${base}/api/public/v1/stats`, { method: "POST" })).status).toBe(405);
  });

  it("validates the window and 404s unknown paths", async () => {
    for (const w of ["5m", "30d", "", "<script>"]) expect((await get(`/api/public/v1/stats?window=${encodeURIComponent(w)}`)).status, w).toBe(400);
    expect((await get("/api/public/v1/stats")).status).toBe(200); // defaults to 24h
    expect((await get("/api/public/v1/nope")).status).toBe(404);
  });

  it("caches for 30 seconds", async () => {
    const a: any = await (await get("/api/public/v1/stats?window=1h")).json();
    await store.insertAudit([row({ at: t - 1000 })]);
    const b: any = await (await get("/api/public/v1/stats?window=1h")).json();
    expect(b.requests.count).toBe(a.requests.count); // still cached
    t += 31_000;
    const c: any = await (await get("/api/public/v1/stats?window=1h")).json();
    expect(c.requests.count).toBe(a.requests.count + 1);
  });

  it("an empty database gives zeros and nulls, not errors", async () => {
    const empty = new PublicApiRoutes({ store: new MemoryStore(), version: "2.0.0", docsUrl: "x", now });
    const s = await empty.stats("24h");
    expect(s).toMatchObject({ users: { total: 0, active: 0, new: 0 }, connections: { live: 0 }, auth: { successRate: null }, requests: { count: 0, successRate: null }, load: { dbPingMs: null, bridgesReporting: 0 } });
    expect((await empty.status()).status).toBe("ok"); // answering, just idle
  });

  it("rate-limits each address", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 65; i++) codes.push((await get("/api/public/v1/info", { "x-forwarded-for": "198.51.100.1" })).status);
    expect(codes).toContain(429);
  });

  it("health assessment still flags real problems", () => {
    expect(assessHealth({ count: 100, faults: 20, p95: 100, dbPingMs: 10, loopLagP99Ms: 5, slowMs: 2000, recentDbFailed: false, bridgeSilentMs: 1000 }).state).toBe("critical");
    expect(assessHealth({ count: 0, faults: 0, p95: 0, dbPingMs: 10, loopLagP99Ms: 5, slowMs: 2000, recentDbFailed: false, bridgeSilentMs: 1000 }).state).toBe("idle");
  });
});

