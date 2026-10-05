import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hostAllowed, readOAuthConfig, type BridgeConfig, type OAuthConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { PgStore } from "../src/oauth/pg-store.js";
import { OAuthProvider, clientIp } from "../src/oauth/provider.js";
import { MemoryStore, type Store } from "../src/oauth/store.js";
import type { AuditEvent } from "../src/execute.js";
import { createHttpServer } from "../src/server.js";

const DB = process.env.TEST_DATABASE_URL;
const CB = "https://claude.ai/api/mcp/auth_callback";
const CID = "11111111-1111-1111-1111-111111111111";

// ───────────── mock fleet of tenant Paperclips, routed by a fake "egress" ─────────────
interface Seen { host: string; path: string; auth?: string }
const seen: Seen[] = [];
const challenges = new Map<string, { host: string; token: string; secret: string; status: string }>();
const revokedBy: string[] = [];
const challengeNames: string[] = [];
let seq = 0;

function fleet(): Server {
  return createServer(async (req: IncomingMessage, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const host = String(req.headers["x-mock-host"]);
    const send = (s: number, b: unknown, ct = "application/json") => (res.writeHead(s, { "Content-Type": ct }), res.end(typeof b === "string" ? b : JSON.stringify(b)));
    const u = new URL(req.url!, "http://x");
    const p = u.pathname;
    const auth = req.headers.authorization;
    if (p === "/api/health") {
      if (host.includes("notpaperclip")) return send(200, "<html>hello</html>", "text/html");
      if (host.includes("nofields")) return send(200, {});
      if (host.includes("down")) return send(500, { error: "boom" });
      return send(200, { status: "ok", deploymentMode: host.includes("localtrusted") ? "local_trusted" : "authenticated" });
    }
    if (p === "/api/cli-auth/challenges" && req.method === "POST") {
      challengeNames.push(JSON.parse(raw).clientName);
      const n = ++seq;
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const ch = { host, token: `board-${host}-${n}`, secret: `secret-${n}-xxxxxxxx`, status: "pending" };
      challenges.set(id, ch);
      if (host.includes("badid")) return send(201, { id: "nope", token: ch.secret, boardApiToken: ch.token, approvalPath: `/cli-auth/${id}?token=${ch.secret}`, expiresAt: new Date(Date.now() + 6e5).toISOString() });
      const approvalPath = host.includes("evilpath") ? "@evil.com/x" : `/cli-auth/${id}?token=${ch.secret}`;
      return send(201, { id, token: ch.secret, boardApiToken: ch.token, approvalPath, expiresAt: new Date(Date.now() + 6e5).toISOString() });
    }
    const m = /^\/api\/cli-auth\/challenges\/([^/]+)$/.exec(p);
    if (m) {
      const ch = challenges.get(m[1]);
      return ch && u.searchParams.get("token") === ch.secret ? send(200, { status: ch.status }) : send(404, { error: "nf" });
    }
    if (p === "/api/cli-auth/me") {
      const ch = [...challenges.values()].find((c) => `Bearer ${c.token}` === auth && c.status === "approved");
      return ch ? send(200, { userId: `user@${ch.host}` }) : send(401, { error: "auth" });
    }
    if (p === "/api/cli-auth/revoke-current") return (revokedBy.push(`${host}|${auth}`), send(200, { revoked: true }));
    seen.push({ host, path: p, auth });
    if (p === `/api/companies/${CID}/agents`) return send(200, [{ id: "a1", name: `agent-of-${host}`, status: "idle" }]);
    if (p === "/api/companies") return send(200, [{ id: CID, name: host }]);
    send(404, { error: "no route" });
  });
}

let mock: Server, mockBase: string;
const outbound: string[] = []; // every URL the bridge tried to reach (the egress layer sees it before the network does)
const egress: typeof fetch = (async (input: any, init: any = {}) => {
  const u = new URL(typeof input === "string" ? input : input.toString());
  outbound.push(u.toString());
  return fetch(`${mockBase}${u.pathname}${u.search}`, { ...init, headers: { ...(init.headers ?? {}), "x-mock-host": u.hostname } });
}) as any;

beforeAll(async () => {
  mock = fleet();
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  mockBase = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
afterAll(() => mock.close());

const approve = (host: string) => {
  for (const c of challenges.values()) if (c.host === host && c.status === "pending") c.status = "approved";
};

interface Rig { base: string; server: Server; provider: OAuthProvider; store: Store; audit: AuditEvent[]; clock: { t: number }; oauth: OAuthConfig; close: () => void }

async function rig(over: Partial<OAuthConfig> = {}, opts: { store?: Store; secret?: string } = {}): Promise<Rig> {
  const clock = { t: 1_800_000_000_000 };
  const audit: AuditEvent[] = [];
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const config: BridgeConfig = { apiUrl: "http://unused.invalid/api", apiKey: "SHOULD-NEVER-BE-USED", companyId: "SHOULD-NEVER-BE-USED", readOnly: false, timeoutMs: 5000 };
  const oauth: OAuthConfig = {
    issuer: `http://localhost:${port}`, secret: opts.secret ?? "s".repeat(40), previousSecrets: [], mode: "multi", login: "paperclip", dataFile: null, database: null,
    paperclipPublicUrl: null, accessTtlSec: 3600, refreshTtlSec: 86400, idleRevokeDays: 30, callsPerMinute: 120, redirectHosts: ["claude.ai"], proxyHops: 0,
    instance: { allowedPorts: [443], denyHosts: ["localhost"], allowHosts: null }, ...over,
  };
  const store = opts.store ?? new MemoryStore(null, () => clock.t);
  const provider = new OAuthProvider({ config, oauth, bridgeToken: null, store, now: () => clock.t, safeFetch: egress });
  const server = createHttpServer(config, { host: "127.0.0.1", port, bridgeToken: null, publicUrl: oauth.issuer, oauth }, { oauth: provider, audit: (e) => audit.push(e) });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { base: oauth.issuer, server, provider, store, audit, clock, oauth, close: () => server.close() };
}

const form = (o: Record<string, string>) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString(), redirect: "manual" as const });
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
const register = async (r: Rig, name = "Claude") =>
  ((await (await fetch(`${r.base}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [CB], client_name: name }) })).json()) as any).client_id as string;

async function start(r: Rig, clientId: string, scope = "paperclip:read paperclip:control") {
  const { verifier, challenge } = pkce();
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: CB, code_challenge: challenge, code_challenge_method: "S256", state: "st", scope, resource: `${r.base}/mcp` });
  const page = await fetch(`${r.base}/authorize?${q}`, { redirect: "manual" });
  const html = await page.text();
  return { verifier, html, page, rid: /name="rid" value="([^"]+)"/.exec(html)?.[1]!, csrf: /name="csrf" value="([^"]+)"/.exec(html)?.[1]! };
}
const instance = (r: Rig, s: { rid: string; csrf: string }, typed: string, extra: Record<string, string> = {}) =>
  fetch(`${r.base}/authorize/instance`, form({ rid: s.rid, csrf: s.csrf, action: "continue", instance: typed, ...extra }));

/** Full connect: returns an access token bound to `host`. */
async function connect(r: Rig, host: string, level = "paperclip:control") {
  const cid = await register(r, `client-${host}`);
  const s = await start(r, cid, level);
  const inst = await instance(r, s, host);
  const html = await inst.text();
  approve(host);
  const dec = await fetch(`${r.base}/authorize/decision`, form({ rid: s.rid, csrf: s.csrf, action: "allow", level }));
  const loc = new URL(dec.headers.get("location")!);
  const tok = (await (await fetch(`${r.base}/token`, form({ grant_type: "authorization_code", code: loc.searchParams.get("code")!, redirect_uri: CB, code_verifier: s.verifier, client_id: cid }))).json()) as any;
  return { cid, tokens: tok, consentHtml: html };
}
const act = (r: Rig, token: string, tool: string, body: unknown = {}) => fetch(`${r.base}/actions/${tool}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ───────────── tests ─────────────
function flowSuite(label: string, makeStore: (now: () => number) => Promise<Store>, closeStore = true) {
  describe(`multi-tenant flow (${label})`, () => {
    it("asks for the instance first, then signs in on THAT instance and binds the grant to it", async () => {
      const clock = { t: 1_800_000_000_000 };
      const store = await makeStore(() => clock.t);
      const r = await rig({}, { store });
      const before = challenges.size;
      const cid = await register(r);
      const s = await start(r, cid);
      expect(s.html).toContain("Connect your Paperclip");
      expect(s.html).toContain('name="instance"');
      expect(challenges.size).toBe(before); // nothing contacted before the user names an instance

      const inst = await (await instance(r, s, "Tenant-A.Example.com")).text();
      expect(inst).toContain("tenant-a.example.com");
      expect(inst).toContain("https://tenant-a.example.com/cli-auth/");
      expect(challengeNames.at(-1)).toMatch(/^Claude \(via bridge, returns to claude\.ai\)$/); // what the user sees on THEIR Paperclip approval page
      approve("tenant-a.example.com");
      const dec = await fetch(`${r.base}/authorize/decision`, form({ rid: s.rid, csrf: s.csrf, action: "allow", level: "paperclip:control" }));
      expect(dec.status).toBe(302);
      const code = new URL(dec.headers.get("location")!).searchParams.get("code")!;
      const t = (await (await fetch(`${r.base}/token`, form({ grant_type: "authorization_code", code, redirect_uri: CB, code_verifier: s.verifier, client_id: cid }))).json()) as any;

      seen.length = 0;
      const res = await act(r, t.access_token, "paperclip_list_agents", { companyId: CID });
      expect(res.status).toBe(200);
      expect(((await res.json()) as any)[0].name).toBe("agent-of-tenant-a.example.com");
      expect(seen.at(-1)).toMatchObject({ host: "tenant-a.example.com", auth: expect.stringMatching(/^Bearer board-tenant-a\.example\.com-/) });
      const [g] = await r.provider.listGrants();
      expect(g.instanceUrl).toBe("https://tenant-a.example.com");
      expect(r.audit.at(-1)).toMatchObject({ tool: "paperclip_list_agents", ok: true, instance: "tenant-a.example.com", userId: "user@tenant-a.example.com" });
      // the operator's placeholder credentials are never used in multi-tenant mode
      expect(JSON.stringify(seen)).not.toContain("SHOULD-NEVER-BE-USED");
      r.close();
      if (closeStore) await store.close();
    });
  });
}
flowSuite("memory store", async (now) => new MemoryStore(null, now));

describe.skipIf(!DB)("multi-tenant flow on Postgres", () => {
  const opts = { connectionString: DB!, ssl: "off" as const };
  it("works end to end with the Postgres store", async () => {
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    await c.query("drop schema if exists bridge cascade");
    await c.end();
    await migrate(opts);
    const clock = { t: 1_800_000_000_000 };
    const store = new PgStore(opts, () => clock.t);
    const r = await rig({}, { store });
    const { tokens } = await connect(r, "tenant-pg.example.com");
    expect((await act(r, tokens.access_token, "paperclip_list_companies")).status).toBe(200);
    // refresh rotation + reuse detection against Postgres
    const cid = (await r.provider.listGrants())[0].clientId;
    const next = (await (await fetch(`${r.base}/token`, form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: cid }))).json()) as any;
    expect((await act(r, next.access_token, "paperclip_list_companies")).status).toBe(200);
    const reuse = (await (await fetch(`${r.base}/token`, form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: cid }))).json()) as any;
    expect(reuse.error).toBe("invalid_grant");
    expect((await act(r, next.access_token, "paperclip_list_companies")).status).toBe(401);
    // no raw secrets at rest
    const q = new pg.Client({ connectionString: DB });
    await q.connect();
    const dump = JSON.stringify((await q.query("select * from bridge.grants")).rows) + JSON.stringify((await q.query("select * from bridge.tokens")).rows) + JSON.stringify((await q.query("select * from bridge.codes")).rows);
    await q.end();
    expect(dump).not.toContain("board-tenant-pg");
    expect(dump).not.toContain(tokens.access_token);
    expect(dump).not.toContain(tokens.refresh_token);
    r.close();
    await store.close();
  });
});

describe("tenant isolation", () => {
  it("each grant reaches only its own instance with only its own credential", async () => {
    const r = await rig();
    const a = await connect(r, "tenant-a.example.com");
    const b = await connect(r, "tenant-b.example.com");
    seen.length = 0;
    await act(r, a.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    await act(r, b.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    await act(r, a.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    expect(seen.map((s) => s.host)).toEqual(["tenant-a.example.com", "tenant-b.example.com", "tenant-a.example.com"]);
    for (const s of seen) expect(s.auth).toContain(s.host); // tenant X's token is never sent to tenant Y
    // the raw-API escape hatch cannot be pointed at another host: it only takes a path
    seen.length = 0;
    await act(r, a.tokens.access_token, "paperclip_api_request", { method: "GET", path: "/companies" });
    expect(seen.at(-1)?.host).toBe("tenant-a.example.com");
    const evil = await act(r, a.tokens.access_token, "paperclip_api_request", { method: "GET", path: "//evil.com/x" });
    expect(seen.every((s) => s.host === "tenant-a.example.com")).toBe(true);
    expect(evil.status).toBeGreaterThanOrEqual(400);
    r.close();
  });
});

describe("instance step: SSRF and abuse", () => {
  const rejected = [
    "localhost", "http://tenant-a.example.com", "127.0.0.1", "https://127.1", "https://2130706433", "10.0.0.5", "169.254.169.254", "https://[::1]",
    "tenant-a.example.com:3100", "tenant-a.example.com:22", "intranet", "db.internal", "https://user:pw@tenant-a.example.com", "file:///etc/passwd", "ftp://tenant-a.example.com",
  ];
  it.each(rejected)("never contacts %j", async (typed) => {
    const r = await rig();
    const s = await start(r, await register(r));
    const before = outbound.length;
    const res = await instance(r, s, typed);
    expect(res.status).toBe(400);
    expect(outbound.length).toBe(before);
    expect(await res.text()).toMatch(/class="err"/);
    r.close();
  });

  it("refuses the bridge's own address (it must not proxy to itself)", async () => {
    const r = await rig({ instance: { allowedPorts: [443], denyHosts: ["bridge.example.com"], allowHosts: null } });
    const s = await start(r, await register(r));
    const before = outbound.length;
    expect((await instance(r, s, "bridge.example.com")).status).toBe(400);
    expect(outbound.length).toBe(before);
    r.close();
  });

  it("honours a host allow-list for private betas", async () => {
    const r = await rig({ instance: { allowedPorts: [443], denyHosts: [], allowHosts: ["*.beta.example.com", "friend.example.org"] } });
    const s = await start(r, await register(r));
    const before = outbound.length;
    const no = await instance(r, s, "tenant-a.example.com");
    expect(no.status).toBe(400);
    expect(await no.text()).toContain("not open to that host");
    expect(outbound.length).toBe(before);
    expect((await instance(r, s, "x.beta.example.com")).status).toBe(200);
    expect(hostAllowed("beta.example.com", ["*.beta.example.com"])).toBe(false);
    expect(hostAllowed("friend.example.org", ["friend.example.org"])).toBe(true);
    r.close();
  });

  const hostile: [string, RegExp][] = [
    ["tenant-notpaperclip.example.com", /did not respond like a Paperclip|non-JSON/],
    ["tenant-nofields.example.com", /did not respond like a Paperclip/],
    ["tenant-localtrusted.example.com", /local_trusted/],
    ["tenant-down.example.com", /Could not reach/],
    ["tenant-evilpath.example.com", /unexpected approval link/],
    ["tenant-badid.example.com", /invalid challenge id/],
  ];
  it.each(hostile)("handles a hostile or wrong server at %s without issuing a consent page", async (host, msg) => {
    const r = await rig();
    const s = await start(r, await register(r));
    const res = await instance(r, s, host);
    const html = await res.text();
    expect(res.status).toBe(400);
    expect(html).toMatch(msg);
    expect(html).not.toContain("evil.com");
    expect(html).not.toContain('name="level"'); // no consent step reached
    r.close();
  });

  it("caps instance attempts per request (probing through the bridge is bounded)", async () => {
    const r = await rig();
    const s = await start(r, await register(r));
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await instance(r, s, `tenant-down${i}.example.com`)).status);
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
    r.close();
  });

  it("requires the CSRF token, and Allow before choosing an instance is refused", async () => {
    const r = await rig();
    const s = await start(r, await register(r));
    const bad = await fetch(`${r.base}/authorize/instance`, form({ rid: s.rid, csrf: "wrong", action: "continue", instance: "tenant-a.example.com" }));
    expect(await bad.text()).toContain("Security token mismatch");
    const early = await fetch(`${r.base}/authorize/decision`, form({ rid: s.rid, csrf: s.csrf, action: "allow", level: "paperclip:read" }));
    expect(early.status).toBe(400);
    expect(await early.text()).toContain("Enter your Paperclip address first");
    const cancel = await instance(r, s, "", { action: "deny" });
    expect(new URL(cancel.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
    r.close();
  });

  it("does not exist in single-instance mode", async () => {
    const r = await rig({ mode: "single" });
    const res = await fetch(`${r.base}/authorize/instance`, form({ rid: "x", csrf: "y", instance: "tenant-a.example.com" }));
    expect(res.status).toBe(404);
    r.close();
  });
});

describe("runtime protections", () => {
  it("re-validates the stored instance on every call (tampered or newly-denied hosts are cut off)", async () => {
    const r = await rig();
    const { tokens } = await connect(r, "tenant-a.example.com");
    expect((await act(r, tokens.access_token, "paperclip_list_companies")).status).toBe(200);
    const [g] = await r.provider.listGrants();
    await r.store.putGrant({ ...g, instanceUrl: "https://localhost" });
    const before = outbound.length;
    expect((await act(r, tokens.access_token, "paperclip_list_companies")).status).toBe(401);
    expect(outbound.length).toBe(before);
    r.close();
  });

  it("limits calls per grant", async () => {
    const r = await rig({ callsPerMinute: 3 });
    const { tokens } = await connect(r, "tenant-a.example.com");
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await act(r, tokens.access_token, "paperclip_list_companies")).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    r.clock.t += 61_000;
    expect((await act(r, tokens.access_token, "paperclip_list_companies")).status).toBe(200);
    r.close();
  });

  it("sweeps idle grants: revokes, deletes the credential, and tells the right tenant to revoke its key", async () => {
    const r = await rig();
    const idle = await connect(r, "tenant-a.example.com");
    r.clock.t += 20 * 86_400_000;
    const active = await connect(r, "tenant-b.example.com");
    r.clock.t += 15 * 86_400_000; // idle one: 35 days since last use; active one: 15
    revokedBy.length = 0;
    expect(await r.provider.sweep()).toBe(1);
    await new Promise((x) => setTimeout(x, 50));
    expect(revokedBy).toHaveLength(1);
    expect(revokedBy[0]).toMatch(/^tenant-a\.example\.com\|Bearer board-tenant-a/);
    const grants = await r.store.listGrants();
    expect(grants.filter((g) => g.revoked).every((g) => g.sealedCredential === null)).toBe(true);
    expect((await act(r, idle.tokens.access_token, "paperclip_list_companies")).status).toBe(401);
    // access tokens had expired by now (1h ttl); the still-live grant is unaffected by the sweep
    expect((await r.store.listGrants()).filter((g) => !g.revoked)).toHaveLength(1);
    expect(active.tokens.refresh_token).toBeDefined();
    r.close();
  });

  it("idleRevokeDays=0 disables the sweep", async () => {
    const r = await rig({ idleRevokeDays: 0 });
    await connect(r, "tenant-a.example.com");
    r.clock.t += 400 * 86_400_000;
    expect(await r.provider.sweep()).toBe(0);
    r.close();
  });
});

describe("key rotation", () => {
  it("old credentials keep working under a previous secret and can be re-sealed", async () => {
    const A = "a".repeat(40), B = "b".repeat(40);
    const store = new MemoryStore(null);
    const r1 = await rig({}, { store, secret: A });
    const { tokens } = await connect(r1, "tenant-a.example.com");
    const sealedBefore = (await store.listGrants())[0].sealedCredential!;
    r1.close();

    const r2 = await rig({ previousSecrets: [A] }, { store, secret: B });
    expect((await act(r2, tokens.access_token, "paperclip_list_companies")).status).toBe(200);
    expect(await r2.provider.rotateKeys()).toBe(1);
    const sealedAfter = (await store.listGrants())[0].sealedCredential!;
    expect(sealedAfter).not.toBe(sealedBefore);
    expect(await r2.provider.rotateKeys()).toBe(0);
    r2.close();

    const r3 = await rig({}, { store, secret: B }); // old secret fully retired
    expect((await act(r3, tokens.access_token, "paperclip_list_companies")).status).toBe(200);
    r3.close();
    const r4 = await rig({}, { store, secret: A }); // wrong secret cannot open it
    expect((await act(r4, tokens.access_token, "paperclip_list_companies")).status).toBe(401);
    r4.close();
  });
});

describe("client IP for rate limiting", () => {
  const req = (xff: string | undefined, remote = "10.0.0.9") => ({ headers: xff ? { "x-forwarded-for": xff } : {}, socket: { remoteAddress: remote } }) as any;
  it("ignores X-Forwarded-For unless proxies are configured", () => expect(clientIp(req("1.2.3.4"), 0)).toBe("10.0.0.9"));
  it("takes the entry N hops from the right, so client-forged left entries don't count", () => {
    expect(clientIp(req("6.6.6.6, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIp(req("6.6.6.6, 203.0.113.7, 10.1.1.1"), 2)).toBe("203.0.113.7");
  });
  it("falls back to the socket when the header is too short or missing", () => {
    expect(clientIp(req(undefined), 1)).toBe("10.0.0.9");
    expect(clientIp(req("1.1.1.1"), 3)).toBe("10.0.0.9");
  });
});

describe("multi-tenant configuration", () => {
  const base = { BRIDGE_OAUTH: "1", BRIDGE_MODE: "multi", BRIDGE_SECRET: "s".repeat(32), DATABASE_URL: "postgresql://u:p@h/db" };
  const url = "https://bridge.example.com";
  it("accepts a safe public configuration and denies the bridge's own host by default", () => {
    const c = readOAuthConfig(base, url, null)!;
    expect(c).toMatchObject({ mode: "multi", login: "paperclip", idleRevokeDays: 30, callsPerMinute: 120 });
    expect(c.instance.denyHosts).toContain("bridge.example.com");
    expect(c.instance.allowedPorts).toEqual([443]);
    expect(c.database?.ssl).toBe("verify");
  });
  it("refuses unsafe public setups", () => {
    expect(() => readOAuthConfig({ ...base, BRIDGE_LOGIN: "static" }, url, "tok")).toThrow(/BRIDGE_LOGIN=paperclip/);
    expect(() => readOAuthConfig(base, url, "tok")).toThrow(/BRIDGE_TOKEN must not be set/);
    expect(() => readOAuthConfig({ ...base, DATABASE_URL: "" }, url, null)).toThrow(/DATABASE_URL/);
    expect(readOAuthConfig({ ...base, DATABASE_URL: "", BRIDGE_ALLOW_EPHEMERAL: "1" }, url, null)).not.toBeNull();
    expect(() => readOAuthConfig({ ...base, BRIDGE_MODE: "nope" }, url, null)).toThrow(/BRIDGE_MODE/);
    expect(() => readOAuthConfig({ ...base, BRIDGE_SECRET_PREVIOUS: "short" }, url, null)).toThrow(/PREVIOUS/);
    expect(() => readOAuthConfig({ ...base, DATABASE_SSL: "maybe" }, url, null)).toThrow(/DATABASE_SSL/);
  });
  it("reads tuning knobs", () => {
    const c = readOAuthConfig({ ...base, BRIDGE_ALLOWED_PORTS: "443,8443", BRIDGE_INSTANCE_ALLOWLIST: "*.example.com", BRIDGE_IDLE_REVOKE_DAYS: "0", BRIDGE_PROXY_HOPS: "1", DATABASE_SSL: "require" }, url, null)!;
    expect(c.instance.allowedPorts).toEqual([443, 8443]);
    expect(c.instance.allowHosts).toEqual(["*.example.com"]);
    expect(c.idleRevokeDays).toBe(0);
    expect(c.proxyHops).toBe(1);
    expect(c.database?.ssl).toBe("require");
  });
});
