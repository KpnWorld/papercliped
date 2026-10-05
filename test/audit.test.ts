import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assessHealth, PanelRoutes } from "../src/panel/routes.js";
import { createPanelServer } from "../src/panel/server.js";
import { readPanelConfig } from "../src/panel/config.js";
import { panelPage } from "../src/panel/page.js";
import { PaperclipClient } from "../src/client.js";
import { readHttpConfig, type BridgeConfig } from "../src/config.js";
import { executeTool } from "../src/execute.js";
import { MemoryStore } from "../src/oauth/store.js";
import { createHttpServer, routeGroup } from "../src/server.js";
import { AuditRecorder, NodeReporter, SystemSampler, toRow } from "../src/telemetry/recorder.js";
import { unionMs } from "../src/telemetry/timing.js";
import type { AuditEvent, AuditRow } from "../src/telemetry/types.js";

const CID = "11111111-1111-1111-1111-111111111111";
let mock: Server, mockUrl: string;
let delayMs = 0;
let upstreamStatus = 200;

beforeAll(async () => {
  mock = createServer(async (req, res) => {
    for await (const _ of req);
    await new Promise((r) => setTimeout(r, delayMs));
    const p = new URL(req.url!, "http://x").pathname;
    const send = (s: number, b: unknown) => (res.writeHead(s, { "Content-Type": "application/json" }), res.end(JSON.stringify(b)));
    if (upstreamStatus !== 200) return send(upstreamStatus, { error: "boom" });
    if (p.endsWith("/agents")) return send(200, [{ id: "a1", name: "CEO", status: "idle" }]);
    if (p.endsWith("/dashboard")) return send(200, { agents: {}, tasks: {}, costs: {}, budgets: {} });
    if (p.endsWith("/live-runs")) return send(200, []);
    if (p.endsWith("/approvals")) return send(200, []);
    send(404, { error: "nope" });
  });
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  mockUrl = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
afterAll(() => mock.close());

const cfg = (over: Partial<BridgeConfig> = {}): BridgeConfig => ({ apiUrl: `${mockUrl}/api`, apiKey: "k", companyId: CID, readOnly: false, timeoutMs: 3000, ...over });
const run = async (name: string, input: unknown = {}, over: Partial<BridgeConfig> = {}, opts: Parameters<typeof executeTool>[3] = {}) => {
  const events: AuditEvent[] = [];
  const out = await executeTool(new PaperclipClient(cfg(over)), name, input, { ...opts, audit: (e) => events.push(e) });
  return { out, ev: events[0] };
};

describe("timing", () => {
  it("unions overlapping intervals so parallel upstream calls are not double-counted", () => {
    expect(unionMs([])).toBe(0);
    expect(unionMs([[0, 100]])).toBe(100);
    expect(unionMs([[0, 100], [50, 150]])).toBe(150);
    expect(unionMs([[0, 100], [200, 250]])).toBe(150);
    expect(unionMs([[0, 100], [10, 20], [90, 120]])).toBe(120);
  });

  it("splits a tool call into total, upstream wait and call count", async () => {
    delayMs = 60;
    upstreamStatus = 200;
    // sync_snapshot fans out 3 requests in parallel: wall ≈ 60 ms, not 180 ms
    const { out, ev } = await run("paperclip_sync_snapshot");
    delayMs = 0;
    expect(out.ok).toBe(true);
    expect(ev).toMatchObject({ kind: "tool", tool: "paperclip_sync_snapshot", ok: true, upstreamCalls: 3, scope: "paperclip:read", actor: "stdio" });
    expect(ev.upstreamMs!).toBeGreaterThanOrEqual(55);
    expect(ev.upstreamMs!).toBeLessThan(150);
    expect(ev.totalMs!).toBeGreaterThanOrEqual(ev.upstreamMs!);
    expect(ev.totalMs! - ev.upstreamMs!).toBeLessThan(80); // bridge overhead is small
  });

  it("a call that never reaches Paperclip has zero upstream time", async () => {
    const { ev } = await run("paperclip_pause_agent", { agentId: "a1" }, { readOnly: true });
    expect(ev).toMatchObject({ ok: false, upstreamCalls: 0, upstreamMs: 0 });
  });
});

describe("error classes separate caller mistakes from system faults", () => {
  const cases: [string, () => ReturnType<typeof run>, number, string][] = [
    ["validation", () => run("paperclip_pause_agent", {}), 400, "invalid_input"],
    ["unknown tool", () => run("nope"), 404, "invalid_input"],
    ["missing confirm", () => run("paperclip_api_request", { method: "DELETE", path: "/x" }), 400, "invalid_input"],
    ["no company id", () => run("paperclip_list_agents", {}, { companyId: null }), 400, "invalid_input"],
    ["bad cursor", () => run("paperclip_sync_changes", { cursor: "yesterday" }), 400, "invalid_input"],
    ["read-only", () => run("paperclip_pause_agent", { agentId: "a1" }, { readOnly: true }), 403, "read_only"],
    ["missing scope", () => run("paperclip_pause_agent", { agentId: "a1" }, {}, { scopes: ["paperclip:read"] }), 403, "insufficient_scope"],
  ];
  it.each(cases)("%s", async (_n, f, status, klass) => {
    const { out, ev } = await f();
    expect(out).toMatchObject({ ok: false, status });
    expect(ev.errorClass).toBe(klass);
  });

  it("classifies upstream outcomes", async () => {
    upstreamStatus = 502;
    expect((await run("paperclip_list_agents")).ev).toMatchObject({ errorClass: "upstream_5xx", status: 502 });
    upstreamStatus = 404;
    expect((await run("paperclip_list_agents")).ev).toMatchObject({ errorClass: "upstream_4xx", status: 404 });
    upstreamStatus = 200;
    const dead = await run("paperclip_list_agents", {}, { apiUrl: "http://127.0.0.1:1/api" });
    expect(dead.out).toMatchObject({ ok: false, status: 502 });
    expect(dead.ev.errorClass).toBe("upstream_unreachable");
  });

  it("success events carry no error fields and no payload", async () => {
    const { ev } = await run("paperclip_list_agents");
    expect(ev.errorClass).toBeUndefined();
    expect(JSON.stringify(ev)).not.toMatch(/agent-of|CEO|"k"|Bearer/);
  });
});

describe("AuditRecorder", () => {
  const ev = (o: Partial<AuditEvent> = {}): AuditEvent => ({ ts: new Date().toISOString(), tool: "t", kind: "tool", mutation: false, ok: true, actor: "pcb_g_abc", totalMs: 12, upstreamMs: 5, upstreamCalls: 1, ...o });

  it("maps events to bounded rows (grant id only for OAuth callers, long strings clipped)", () => {
    const r = toRow(ev({ client: "x".repeat(500), instance: "h".repeat(500), userId: "u".repeat(500) }), "n1");
    expect(r.client).toHaveLength(100);
    expect(r.instance).toHaveLength(255);
    expect(r.userId).toHaveLength(200);
    expect(r.grantId).toBe("pcb_g_abc");
    expect(toRow(ev({ actor: "static-token" }), "n").grantId).toBeNull();
    expect(toRow(ev({ actor: "stdio" }), "n").grantId).toBeNull();
  });

  it("writes in batches off the request path", async () => {
    const store = new MemoryStore();
    const rec = new AuditRecorder(store, { node: "n1", maxBatch: 1000 });
    for (let i = 0; i < 25; i++) rec.record(ev({ totalMs: i }));
    expect(rec.stats()).toMatchObject({ buffered: 25, flushed: 0 });
    expect((await store.auditRecent(0, 100)).length).toBe(0);
    await rec.flush();
    expect(rec.stats()).toMatchObject({ buffered: 0, flushed: 25, dropped: 0 });
    expect((await store.auditRecent(0, 100)).length).toBe(25);
  });

  it("flushes automatically when a batch fills", async () => {
    const store = new MemoryStore();
    const rec = new AuditRecorder(store, { node: "n", maxBatch: 5 });
    for (let i = 0; i < 5; i++) rec.record(ev());
    await rec.flush();
    expect((await store.auditRecent(0, 100)).length).toBe(5);
  });

  it("never throws or blocks when the database is down; retries; drops oldest past the cap", async () => {
    let down = true;
    const calls: AuditRow[][] = [];
    const store = new MemoryStore();
    const flaky = Object.assign(Object.create(store), {
      insertAudit: async (rows: AuditRow[]) => {
        if (down) throw new Error("db down");
        calls.push(rows);
        await store.insertAudit(rows);
      },
    });
    const rec = new AuditRecorder(flaky, { node: "n", maxBatch: 1_000_000, maxBuffer: 10 });
    for (let i = 0; i < 15; i++) expect(() => rec.record(ev({ totalMs: i }))).not.toThrow();
    expect(rec.stats()).toMatchObject({ buffered: 10, dropped: 5 });
    await rec.flush();
    expect(rec.stats()).toMatchObject({ buffered: 10, lastError: "db down" });
    down = false;
    await rec.flush();
    expect(rec.stats()).toMatchObject({ buffered: 0, flushed: 10, lastError: null });
    expect(calls[0].map((r) => r.totalMs)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]); // oldest five were dropped
  });

  it("optionally mirrors each event to stderr as one JSON line", () => {
    const lines: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = (s: string) => (lines.push(String(s)), true);
    try {
      new AuditRecorder(new MemoryStore(), { stderr: true }).record(ev());
    } finally {
      (process.stderr as any).write = orig;
    }
    expect(JSON.parse(lines[0]).audit.tool).toBe("t");
  });
});

describe("SystemSampler", () => {
  it("measures database round-trip, loop lag and memory, and survives a failing database", async () => {
    let fail = false;
    const s = new SystemSampler({ ping: async () => { await new Promise((r) => setTimeout(r, 5)); if (fail) throw new Error("x"); } }, 1000);
    await s.sample();
    await s.sample();
    let snap = s.snapshot();
    expect(snap.dbPingMs).toBeGreaterThanOrEqual(4);
    expect(snap.rssMb).toBeGreaterThan(10);
    expect(snap.recentPing).toHaveLength(2);
    fail = true;
    await s.sample();
    snap = s.snapshot();
    expect(snap).toMatchObject({ dbPingMs: null, dbFailures: 1 });
    expect(snap.recentPing.at(-1)).toBeNull();
    s.stop();
  });
});

describe("health assessment", () => {
  const base = { count: 100, faults: 0, p95: 200, dbPingMs: 10, dbFailures: 0, loopLagP99Ms: 5, slowMs: 1500, recentDbFailed: false, bridgeSilentMs: 5000 };
  it("healthy / idle", () => {
    expect(assessHealth(base).state).toBe("healthy");
    expect(assessHealth({ ...base, count: 0 })).toMatchObject({ state: "idle" });
  });
  it("degrades on slow p95, faults, slow DB, loop lag; critical at higher thresholds", () => {
    expect(assessHealth({ ...base, p95: 1600 }).state).toBe("degraded");
    expect(assessHealth({ ...base, p95: 5000 }).state).toBe("critical");
    expect(assessHealth({ ...base, faults: 3 }).state).toBe("degraded");
    expect(assessHealth({ ...base, faults: 12 }).state).toBe("critical");
    expect(assessHealth({ ...base, dbPingMs: 400 }).state).toBe("degraded");
    expect(assessHealth({ ...base, dbPingMs: 1500 }).state).toBe("critical");
    expect(assessHealth({ ...base, recentDbFailed: true }).state).toBe("critical");
    expect(assessHealth({ ...base, loopLagP99Ms: 150 }).state).toBe("degraded");
    expect(assessHealth({ ...base, loopLagP99Ms: 900 }).state).toBe("critical");
  });
  it("a handful of calls is not enough to judge latency or fault rate", () => {
    expect(assessHealth({ ...base, count: 3, faults: 3, p95: 9000 }).state).toBe("healthy");
  });
  it("flags a bridge that stopped reporting (asleep or down) and one that never reported", () => {
    expect(assessHealth({ ...base, bridgeSilentMs: 200_000 })).toMatchObject({ state: "critical" });
    expect(assessHealth({ ...base, bridgeSilentMs: 200_000 }).reasons.join(" ")).toMatch(/asleep, down/);
    expect(assessHealth({ ...base, bridgeSilentMs: null }).state).toBe("degraded");
  });
  it("explains itself", () => {
    expect(assessHealth({ ...base, p95: 1600, faults: 3 }).reasons.join(" ")).toMatch(/p95 latency 1600 ms.*|.*system fault/);
  });
});

describe("routeGroup", () => {
  it("groups measurable endpoints and ignores the rest", () => {
    expect(routeGroup("/token")).toBe("oauth.token");
    expect(routeGroup("/authorize/decision")).toBe("oauth.authorize");
    expect(routeGroup("/mcp")).toBe("mcp");
    expect(routeGroup("/actions/paperclip_list_agents")).toBe("actions");
    for (const p of ["/healthz", "/readyz", "/openapi.json", "/admin", "/admin/api/summary", "/.well-known/oauth-authorization-server", "/nope"]) expect(routeGroup(p)).toBeNull();
  });
});

// ───────────── end to end: the bridge writes, the SEPARATE panel reads ─────────────
describe("panel end to end", () => {
  const ADMIN = "a".repeat(32);
  const clock = { offset: 0 };
  const tnow = () => Date.now() + clock.offset;
  let bridge: Server, panel: Server, bb: string, base: string, store: MemoryStore, recorder: AuditRecorder;
  const hits = new Map<string, number[]>();

  beforeAll(async () => {
    store = new MemoryStore(null, tnow);
    recorder = new AuditRecorder(store, { node: "test-node" });
    const sampler = new SystemSampler(store);
    await sampler.sample();
    await new NodeReporter(store, sampler, "test-node").report();
    bridge = createHttpServer(cfg(), { host: "127.0.0.1", port: 0, bridgeToken: "tool-token", publicUrl: null, oauth: null, audit: { retentionDays: 30, stderr: false } } as any, { recorder });
    await new Promise<void>((r) => bridge.listen(0, "127.0.0.1", r));
    bb = `http://127.0.0.1:${(bridge.address() as AddressInfo).port}`;
    const limit = (k: string, n: number, w: number) => {
      const l = (hits.get(k) ?? []).filter((t) => tnow() - t < w);
      if (l.length >= n) return false;
      l.push(tnow());
      hits.set(k, l);
      return true;
    };
    const routes = new PanelRoutes({ token: ADMIN, sessionHours: 8, secureCookie: false, store, slowMs: 1500, mode: "test", persistent: false, limit, now: tnow });
    panel = createPanelServer({ routes });
    await new Promise<void>((r) => panel.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(panel.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    bridge.close();
    panel.close();
  });

  const post = (path: string, headers: Record<string, string>, body: unknown = {}) => fetch(`${bb}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const login = async (token = ADMIN) => fetch(`${base}/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString(), redirect: "manual" });
  let cached: string | undefined;
  const session = async () => (cached ??= (await login()).headers.get("set-cookie")!.split(";")[0]);

  it("the bridge no longer serves any admin surface", async () => {
    for (const p of ["/admin", "/admin/api/summary", "/admin/login"]) expect((await fetch(`${bb}${p}`)).status, p).toBeGreaterThanOrEqual(401);
  });

  it("requires sign-in for pages and APIs", async () => {
    expect((await fetch(`${base}/api/summary`)).status).toBe(401);
    expect((await fetch(`${base}/api/events`)).status).toBe(401);
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('name="token"');
    expect(html).not.toContain("/api/summary"); // dashboard code is not served to anonymous visitors
  });

  it("rejects wrong tokens, rate-limits guessing, and sets a hardened cookie on success", async () => {
    const bad = await login("nope");
    expect(bad.status).toBe(401);
    expect(await bad.text()).toContain("Incorrect token");
    const ok = await login();
    expect(ok.status).toBe(303);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^pcp_panel=\d+\.[A-Za-z0-9_-]+;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await login(`guess${i}`)).status);
    expect(codes).toContain(429);
    clock.offset += 61_000;
  });

  it("serves the dashboard with a strict CSP and no embedded data or network loads", async () => {
    const res = await fetch(`${base}/`, { headers: { cookie: await session() } });
    const html = await res.text();
    expect(html).toContain("Latency percentiles");
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).not.toMatch(/unsafe-eval|https?:\/\//);
    expect(html).not.toMatch(/<script(?![^>]*nonce)/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(html).not.toMatch(/(src|href|action)=["']https?:/);
  });

  it("the dashboard script is valid JavaScript", () => {
    const html = panelPage("n0nce", { slowMs: 1500 });
    const m = /<script nonce="n0nce">([\s\S]*?)<\/script>/.exec(html);
    expect(m).toBeTruthy();
    expect(() => new Function(m![1])).not.toThrow();
  });

  it("rejects forged, tampered and expired session cookies", async () => {
    const good = await session();
    const [name, val] = good.split("=");
    const [exp, mac] = val.split(".");
    for (const c of [`${name}=${exp}.${mac.slice(0, -2)}xx`, `${name}=${Number(exp) + 999999}.${mac}`, `${name}=1.${mac}`, `${name}=garbage`, `${name}=`])
      expect((await fetch(`${base}/api/summary`, { headers: { cookie: c } })).status, c).toBe(401);
    clock.offset += 9 * 3600_000;
    expect((await fetch(`${base}/api/summary`, { headers: { cookie: good } })).status).toBe(401);
    clock.offset -= 9 * 3600_000;
  });

  it("the admin token and panel session cannot be used as tool access", async () => {
    expect((await post("/actions/paperclip_list_agents", { Authorization: `Bearer ${ADMIN}` })).status).toBe(401);
    expect((await post("/actions/paperclip_list_agents", { cookie: await session() })).status).toBe(401);
    expect((await post("/actions/paperclip_list_agents", { Authorization: "Bearer tool-token" }, { companyId: CID })).status).toBe(200);
  });

  it("records real bridge traffic and the panel summary reflects it", async () => {
    delayMs = 25;
    for (let i = 0; i < 6; i++) await post("/actions/paperclip_list_agents", { Authorization: "Bearer tool-token" }, { companyId: CID });
    await post("/actions/paperclip_pause_agent", { Authorization: "Bearer tool-token" }, {});
    delayMs = 0;
    await recorder.flush();
    const cookie = await session();
    const j: any = await (await fetch(`${base}/api/summary?window=15m`, { headers: { cookie } })).json();
    expect(j.totals).toMatchObject({ count: 8, errors: 1, faults: 0 });
    expect(j.totals.upstreamP95).toBeGreaterThanOrEqual(20);
    expect(j.byTool.find((r: any) => r.key === "paperclip_list_agents")).toMatchObject({ count: 7, errors: 0 });
    expect(j.byError).toEqual([expect.objectContaining({ key: "invalid_input", count: 1 })]);
    expect(j.health.state).toBe("healthy");
    expect(j.system).toMatchObject({ mode: "test", persistent: false });
    expect(j.system.nodes[0]).toMatchObject({ node: "test-node" });
    expect(j.system.bridgeSilentMs).toBeLessThan(120_000);
    expect(JSON.stringify(j)).not.toMatch(/tool-token|Bearer|"k"/);
    expect(Object.keys(j.slowest[0])).not.toContain("userId");

    const ev: any = await (await fetch(`${base}/api/events?limit=3`, { headers: { cookie } })).json();
    expect(ev.events).toHaveLength(3);
    expect(ev.events[0].id).toBeGreaterThan(ev.events[1].id);
    const none: any = await (await fetch(`${base}/api/events?after=${ev.events[0].id}`, { headers: { cookie } })).json();
    expect(none.events).toEqual([]);
  });

  it("a silent bridge (asleep or down) turns the panel critical", async () => {
    clock.offset += 5 * 60_000;
    const cookie = await session();
    // the session cookie is still valid (8 h); no new node sample arrived for 5 min
    const j: any = await (await fetch(`${base}/api/summary?window=15m`, { headers: { cookie } })).json();
    clock.offset -= 5 * 60_000;
    expect(j.system.bridgeSilentMs).toBeGreaterThan(120_000);
    expect(j.health.state).toBe("critical");
    expect(j.health.reasons.join(" ")).toMatch(/has not reported/);
  });

  it("community: counts, success rate, failure reasons, anonymous aliases, and the log feed", async () => {
    const cookie = await session();
    const t = tnow();
    const E = (kind: any, username: string | null, detail: string | null, dt: number) => store.insertUserEvent({ at: t - dt, accountId: username ? `a_${username}` : null, username, kind, detail });
    for (const e of [
      ["started", null, null, 9000], ["joined", "og.kpnwrld", "paperclip.acme.dev", 8000], ["completed", "og.kpnwrld", "new", 7900],
      ["started", null, null, 7000], ["login", "Ann02", "claude.ai", 6000], ["completed", "Ann02", "login", 5900],
      ["started", null, null, 5000], ["login_failed", null, "bad_credentials", 4000], ["started", null, null, 3000], ["connect_failed", null, "denied", 2500],
      ["updated", "og.kpnwrld", "secret_rotated", 2000], ["left", "Ann02", "disconnected", 1000],
    ] as const) await E(e[0], e[1], e[2], e[3]);
    await store.createAccount({ id: "a_og", username: "og.kpnwrld", usernameKey: "og.kpnwrld", secretHash: "scrypt$x", createdAt: t, lastLoginAt: null, disabled: false });
    const j: any = await (await fetch(`${base}/api/summary?window=15m`, { headers: { cookie } })).json();
    const c = j.community;
    expect(c).toMatchObject({ name: "cliped", totalUsers: 1 });
    expect(c.counts).toMatchObject({ started: 4, completed: 2, joined: 1, login: 1, login_failed: 1, connect_failed: 1, updated: 1, left: 1 });
    expect(c.successRate).toBeCloseTo(0.5, 5);
    expect(c.failures).toEqual({ "login_failed:bad_credentials": 1, "connect_failed:denied": 1 });
    expect(JSON.stringify(c)).not.toMatch(/scrypt|secret_hash|sealed/);
    expect((await fetch(`${base}/api/community/events`)).status).toBe(401);
    const feed: any = await (await fetch(`${base}/api/community/events?limit=10`, { headers: { cookie } })).json();
    expect(feed.events.map((e: any) => `${e.username ?? "(visitor)"} ${e.kind}`)).toEqual(["Ann02 left", "og.kpnwrld updated", "(visitor) connect_failed", "(visitor) login_failed", "Ann02 login", "og.kpnwrld joined"]);
    const newer: any = await (await fetch(`${base}/api/community/events?after=${feed.events[0].id}`, { headers: { cookie } })).json();
    expect(newer.events).toEqual([]);
  });

  it("validates the window parameter and flags system faults", async () => {
    const cookie = await session();
    expect((await fetch(`${base}/api/summary?window=forever`, { headers: { cookie } })).status).toBe(400);
    await new NodeReporter(store, new SystemSampler(store), "test-node").report(); // the bridge is alive again
    upstreamStatus = 503;
    for (let i = 0; i < 8; i++) await post("/actions/paperclip_list_agents", { Authorization: "Bearer tool-token" }, { companyId: CID });
    upstreamStatus = 200;
    await recorder.flush();
    const j: any = await (await fetch(`${base}/api/summary?window=15m`, { headers: { cookie } })).json();
    expect(j.totals.faults).toBe(8);
    expect(["degraded", "critical"]).toContain(j.health.state);
    expect(j.health.reasons.join(" ")).toMatch(/system fault/);
  });

  it("logout clears the cookie", async () => {
    const res = await fetch(`${base}/logout`, { method: "POST", redirect: "manual" });
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("a hostile tenant host or client name can't inject markup", async () => {
    await store.insertAudit([{ at: tnow(), node: "n", kind: "tool", name: "t", mutation: false, ok: true, status: null, errorClass: null, totalMs: 1, upstreamMs: 1, upstreamCalls: 1, scope: null, grantId: null, client: "<img src=x onerror=alert(1)>", instance: "<script>alert(1)</script>.example.com", userId: null }]);
    const cookie = await session();
    const page = await (await fetch(`${base}/`, { headers: { cookie } })).text();
    expect(page).not.toContain("onerror");
    expect(page).not.toContain("alert(1)");
  });
});

describe("panel configuration", () => {
  const ok = { PANEL_ADMIN_TOKEN: "a".repeat(30), PANEL_DATABASE_URL: "postgres://panel_ro:x@db.example.com/postgres" };
  it("needs its own token and read-only database URL", () => {
    expect(() => readPanelConfig({} as any)).toThrow(/PANEL_ADMIN_TOKEN/);
    expect(() => readPanelConfig({ PANEL_ADMIN_TOKEN: "short" } as any)).toThrow(/at least 24/);
    expect(() => readPanelConfig({ PANEL_ADMIN_TOKEN: "a".repeat(30) } as any)).toThrow(/PANEL_DATABASE_URL/);
    expect(readPanelConfig({ ...ok, PANEL_DEMO: "1" } as any).demo).toBe(true);
    expect(readPanelConfig(ok as any)).toMatchObject({ port: 3940, host: "127.0.0.1", communityName: "cliped", allowedIps: null });
  });
  it("refuses to run with the bridge's secrets in its environment", () => {
    for (const k of ["BRIDGE_SECRET", "DATABASE_URL", "BRIDGE_SECRET_PREVIOUS", "DATABASE_MIGRATE_URL"]) expect(() => readPanelConfig({ ...ok, [k]: "x" } as any), k).toThrow(/separate program/);
  });
  it("validates the IP allow-list and enforces it", async () => {
    expect(() => readPanelConfig({ ...ok, PANEL_ALLOWED_IPS: "not-an-ip" } as any)).toThrow(/invalid entry/);
    const store = new MemoryStore();
    const routes = new PanelRoutes({ token: "a".repeat(30), sessionHours: 1, secureCookie: false, store, slowMs: 1500, mode: "t", persistent: false, limit: () => true });
    const srv = createPanelServer({ routes, allowedIps: ["10.1.2.3", "192.168.0.0/16"], proxyHops: 1 });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const u = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    expect((await fetch(`${u}/`, { headers: { "x-forwarded-for": "9.9.9.9" } })).status).toBe(403);
    expect((await fetch(`${u}/`, { headers: { "x-forwarded-for": "1.1.1.1, 192.168.4.4" } })).status).toBe(200);
    expect((await fetch(`${u}/healthz`, { headers: { "x-forwarded-for": "9.9.9.9" } })).status).toBe(200);
    srv.close();
  });
});

describe("bridge configuration", () => {
  it("audit settings", () => {
    expect(readHttpConfig({ BRIDGE_AUDIT_RETENTION_DAYS: "7", BRIDGE_AUDIT_STDERR: "0", BRIDGE_TOKEN: "t".repeat(32) } as any).audit).toEqual({ retentionDays: 7, stderr: false });
    expect(readHttpConfig({} as any).audit).toEqual({ retentionDays: 30, stderr: true });
  });
});
