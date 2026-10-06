import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSecretKey, hashSecretKey, normalizeSecretKey } from "../src/accounts/secret.js";
import { usernameKey } from "../src/accounts/username.js";
import type { BridgeConfig, OAuthConfig } from "../src/config.js";
import { ManageRoutes } from "../src/manage/routes.js";
import { MANAGE_SCRIPT } from "../src/manage/page.js";
import { sha256Hex } from "../src/oauth/crypto.js";
import { OAuthProvider } from "../src/oauth/provider.js";
import { MemoryStore, type Grant } from "../src/oauth/store.js";
import { createHttpServer } from "../src/server.js";

let server: Server, base: string, store: MemoryStore, provider: OAuthProvider;
const config: BridgeConfig = { apiUrl: "http://unused.invalid/api", apiKey: null, companyId: null, readOnly: false, timeoutMs: 1000 };
const H = { "content-type": "application/json", "x-papercliped": "1" };

async function account(name: string, anon = false) {
  const secret = generateSecretKey();
  const id = `acct_${name}`;
  await store.createAccount({ id, username: name, usernameKey: usernameKey(name), secretHash: await hashSecretKey(normalizeSecretKey(secret)!), createdAt: Date.now(), lastLoginAt: null, disabled: false, anonymous: false, alias: anon ? "Ann02" : null });
  await store.putLink({ accountId: id, instanceUrl: "https://paperclip.example.com", paperclipUserId: `u_${name}`, sealedCredential: "sealed", createdAt: Date.now(), connectedAt: Date.now(), lastUsedAt: Date.now(), instanceLabel: "paperclip.example.com" });
  return { id, secret };
}
async function grant(accountId: string, scopes: string[], app = "Claude"): Promise<Grant> {
  const g: Grant = { id: `g_${Math.random().toString(36).slice(2, 10)}`, clientId: "c", clientName: app, userId: null, scopes, resource: "r", instanceUrl: null, sealedCredential: null, accountId, username: accountId, createdAt: Date.now(), lastUsedAt: Date.now(), revoked: false };
  await store.putGrant(g);
  await store.putAccess(sha256Hex(`pcb_at_${g.id}`), { grantId: g.id, expiresAt: Date.now() + 3600_000, consumed: false });
  return g;
}
const call = (method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = H) =>
  fetch(`${base}${path}`, { method, headers: { ...headers, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
async function login(name: string, secret: string) {
  const r = await call("POST", "/api/manage/login", { username: name, secret });
  return { r, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

beforeAll(async () => {
  store = new MemoryStore();
  const oauth: OAuthConfig = {
    issuer: "http://localhost:1", secret: "s".repeat(40), previousSecrets: [], mode: "multi", accounts: true, login: "paperclip", dataFile: null, database: null,
    paperclipPublicUrl: null, accessTtlSec: 3600, refreshTtlSec: 86400 * 40, idleRevokeDays: 30, callsPerMinute: 120, redirectHosts: ["claude.ai"], proxyHops: 0,
    instance: { allowedPorts: [443], denyHosts: ["localhost"], allowHosts: null },
  };
  provider = new OAuthProvider({ config, oauth, bridgeToken: null, store });
  server = createHttpServer(config, { host: "127.0.0.1", port: 0, bridgeToken: null, publicUrl: oauth.issuer, oauth } as any, { oauth: provider, manage: new ManageRoutes(provider, { secureCookie: false }) });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("connection manager (beta)", () => {
  it("serves a nonce'd page whose script is valid JavaScript", async () => {
    const res = await fetch(`${base}/manage`);
    const html = await res.text();
    const nonce = /script-src 'nonce-([^']+)'/.exec(res.headers.get("content-security-policy")!)![1];
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(res.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(() => new Function(MANAGE_SCRIPT)).not.toThrow();
    expect(html).not.toMatch(/(src|href|action)=["']https?:/);
  });

  it("needs a session, the JSON content type and the custom header", async () => {
    expect((await call("GET", "/api/manage/me")).status).toBe(401);
    expect((await call("GET", "/api/manage/connections")).status).toBe(401);
    const a = await account("csrf.test1");
    const { cookie } = await login(a.id.replace("acct_", ""), a.secret);
    expect(cookie).toMatch(/^pcp_manage=/);
    expect((await call("POST", "/api/manage/beta", { beta: true }, cookie, { "content-type": "application/json" })).status).toBe(400); // no custom header: a cross-site form could send this
    expect((await call("POST", "/api/manage/beta", { beta: true }, cookie, { "x-papercliped": "1", "content-type": "text/plain" })).status).toBe(400);
  });

  it("rejects forged, tampered and unrelated cookies", async () => {
    const a = await account("cookie.test1");
    const { cookie } = await login("cookie.test1", a.secret);
    const [name, val] = cookie.split("=");
    const [id, exp, fp, mac] = val.split("~");
    for (const c of [`${name}=${id}~${exp}~${fp}~${mac.slice(0, -2)}xx`, `${name}=${id}~${Number(exp) + 99999}~${fp}~${mac}`, `${name}=acct_other~${exp}~${fp}~${mac}`, `${name}=garbage`])
      expect((await call("GET", "/api/manage/me", undefined, c)).status, c).toBe(401);
    expect((await call("GET", "/api/manage/me", undefined, cookie)).status).toBe(200);
  });

  it("manager features need the beta; joining unlocks them", async () => {
    const a = await account("beta.test1");
    const { cookie } = await login("beta.test1", a.secret);
    const me: any = await (await call("GET", "/api/manage/me", undefined, cookie)).json();
    expect(me).toMatchObject({ name: "beta.test1", beta: false, paperclip: "paperclip.example.com", connected: true });
    const r = await call("GET", "/api/manage/connections", undefined, cookie);
    expect(r.status).toBe(403);
    expect(((await r.json()) as any).code).toBe("beta_required");
    expect((await call("POST", "/api/manage/beta", { beta: true }, cookie)).status).toBe(200);
    expect((await call("GET", "/api/manage/connections", undefined, cookie)).status).toBe(200);
    expect((await store.getAccount(a.id))!.beta).toBe(true);
  });

  it("lists only your own connections and changes access immediately, with two levels", async () => {
    const a = await account("levels.test1");
    const other = await account("levels.other1");
    const mine = await grant(a.id, ["paperclip:read"], "Claude");
    const admin = await grant(a.id, ["paperclip:read", "paperclip:control", "paperclip:admin"], "Claude Code");
    const theirs = await grant(other.id, ["paperclip:read"], "ChatGPT");
    const { cookie } = await login("levels.test1", a.secret);
    await call("POST", "/api/manage/beta", { beta: true }, cookie);

    const list: any = await (await call("GET", "/api/manage/connections", undefined, cookie)).json();
    expect(list.connections.map((c: any) => c.app).sort()).toEqual(["Claude", "Claude Code"]);
    expect(JSON.stringify(list)).not.toMatch(/sealed|credential|pcb_/);
    expect(list.connections.find((c: any) => c.id === admin.id).level).toBe("paperclip:control"); // an old admin grant shows as Full control

    // someone else's connection is "not found", not "forbidden": it does not even confirm it exists
    expect((await call("POST", `/api/manage/connections/${theirs.id}`, { level: "control" }, cookie)).status).toBe(404);
    expect((await call("DELETE", `/api/manage/connections/${theirs.id}`, undefined, cookie)).status).toBe(404);
    expect((await store.getGrant(theirs.id))!.revoked).toBe(false);

    // read → control takes effect on the very next authenticated call
    expect((await call("POST", `/api/manage/connections/${mine.id}`, { level: "control" }, cookie)).status).toBe(200);
    expect((await provider.authenticate(`pcb_at_${mine.id}`))!.scopes).toEqual(["paperclip:read", "paperclip:control"]);
    expect((await call("POST", `/api/manage/connections/${mine.id}`, { level: "read" }, cookie)).status).toBe(200);
    expect((await provider.authenticate(`pcb_at_${mine.id}`))!.scopes).toEqual(["paperclip:read"]);

    // only "read" and "control" exist; an old admin grant can be lowered like any other
    expect((await call("POST", `/api/manage/connections/${mine.id}`, { level: "admin" }, cookie)).status).toBe(400);
    expect((await call("POST", `/api/manage/connections/${admin.id}`, { level: "read" }, cookie)).status).toBe(200);
    expect((await call("POST", `/api/manage/connections/${admin.id}`, { level: "bogus" }, cookie)).status).toBe(400);

    // disconnecting cuts the app off at once
    expect((await call("DELETE", `/api/manage/connections/${mine.id}`, undefined, cookie)).status).toBe(200);
    expect(await provider.authenticate(`pcb_at_${mine.id}`)).toBeNull();
    expect((await call("POST", `/api/manage/connections/${mine.id}`, { level: "control" }, cookie)).status).toBe(404);
  });

  it("anonymity: the logs show the alias, never the real name", async () => {
    const a = await account("anon.test1");
    const { cookie } = await login("anon.test1", a.secret);
    await call("POST", "/api/manage/beta", { beta: true }, cookie);
    const r: any = await (await call("POST", "/api/manage/privacy", { anonymous: true }, cookie)).json();
    expect(r.anonymous).toBe(true);
    expect(r.alias).toMatch(/^[A-Za-z]+\d\d$/);
    expect(r.name).toBe(r.alias);
    const events = await store.userEventsRecent(0, 500);
    expect(events.filter((e) => e.accountId === a.id).every((e) => e.username === r.alias)).toBe(true);
    expect(JSON.stringify(events.filter((e) => e.accountId === a.id).map((e) => [e.username, e.detail]))).not.toContain("anon.test1"); // (the test's account id embeds the name; real ids are random)
    expect((await call("POST", "/api/manage/privacy", { anonymous: "yes" }, cookie)).status).toBe(400);
  });

  it("sensitive actions need the secret key again; a new key ends the old sessions", async () => {
    const a = await account("rotate.test1");
    const { cookie } = await login("rotate.test1", a.secret);
    await call("POST", "/api/manage/beta", { beta: true }, cookie);
    expect((await call("POST", "/api/manage/secret/rotate", {}, cookie)).status).toBe(403);
    expect((await call("POST", "/api/manage/secret/rotate", { secret: "pcs_WRONG-WRONG-WRONG-WRONG" }, cookie)).status).toBe(403);
    const r = await call("POST", "/api/manage/secret/rotate", { secret: a.secret }, cookie);
    expect(r.status).toBe(200);
    const fresh = ((await r.json()) as any).secret as string;
    expect(fresh).toMatch(/^pcs_/);
    const newCookie = r.headers.get("set-cookie")!.split(";")[0];
    expect((await call("GET", "/api/manage/me", undefined, cookie)).status).toBe(401); // the old session died
    expect((await call("GET", "/api/manage/me", undefined, newCookie)).status).toBe(200); // the rotating session continues
    expect((await login("rotate.test1", a.secret)).r.status).toBe(401); // the old key is dead
    expect((await login("rotate.test1", fresh)).r.status).toBe(200);
  });

  it("disconnecting your Paperclip forgets the key and cuts every app; deleting the account needs the username", async () => {
    const a = await account("danger.test1");
    const g = await grant(a.id, ["paperclip:read"]);
    const { cookie } = await login("danger.test1", a.secret);
    await call("POST", "/api/manage/beta", { beta: true }, cookie);
    expect((await call("POST", "/api/manage/paperclip/disconnect", { secret: "pcs_WRONG-WRONG-WRONG-WRONG" }, cookie)).status).toBe(403);
    expect((await call("POST", "/api/manage/paperclip/disconnect", { secret: a.secret }, cookie)).status).toBe(200);
    expect((await store.getLink(a.id))!.sealedCredential).toBeNull();
    expect(await provider.authenticate(`pcb_at_${g.id}`)).toBeNull();
    expect((await call("GET", "/api/manage/me", undefined, cookie).then((r) => r.json()) as any).connected).toBe(false);

    expect((await call("POST", "/api/manage/account/delete", { secret: a.secret, confirm: "wrong" }, cookie)).status).toBe(400);
    expect((await store.getAccount(a.id))).toBeTruthy();
    const del = await call("POST", "/api/manage/account/delete", { secret: a.secret, confirm: "Danger.Test1" }, cookie);
    expect(del.status).toBe(200);
    expect(del.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(await store.getAccount(a.id)).toBeUndefined();
    expect((await login("danger.test1", a.secret)).r.status).toBe(401);
  });

  describe("Paperclip plugin link", () => {
    const bearer = (t: string) => ({ "content-type": "application/json", authorization: `Bearer ${t}` }); // note: no x-papercliped header
    const exchange = (code: string, extra: Record<string, unknown> = {}) => call("POST", "/api/manage/plugin-link/exchange", { code, ...extra });
    let cookie: string, acct: { id: string; secret: string };

    async function linked(extra: Record<string, unknown> = {}) {
      const mint: any = await (await call("POST", "/api/manage/plugin-link", {}, cookie)).json();
      const r = await exchange(mint.code, { instanceHost: "Paperclip.Example.com", paperclipUserId: "u_1", ...extra });
      return { code: mint.code as string, r, token: ((await r.clone().json()) as any).token as string | undefined };
    }

    it("only a beta browser session can make a code; codes look right and expire in 10 minutes", async () => {
      acct = await account("plink.test1");
      ({ cookie } = await login("plink.test1", acct.secret));
      expect((await call("POST", "/api/manage/plugin-link", {}, cookie)).status).toBe(403); // not in the beta yet
      expect((await call("POST", "/api/manage/plugin-link", {})).status).toBe(401); // no session
      await call("POST", "/api/manage/beta", { beta: true }, cookie);
      const r: any = await (await call("POST", "/api/manage/plugin-link", {}, cookie)).json();
      expect(r.code).toMatch(/^pcl_[A-Z0-9]{5}-[A-Z0-9]{5}$/);
      expect(r.expiresInSec).toBe(600);
    });

    it("a code works exactly once, and wrong, malformed and used codes all fail the same way", async () => {
      const { code, r, token } = await linked();
      expect(r.status).toBe(200);
      expect(token).toMatch(/^pcb_pl_/);
      const again = await exchange(code);
      const wrong = await exchange("pcl_AAAAA-BBBBB");
      const junk = await exchange("not a code");
      expect([again.status, wrong.status, junk.status]).toEqual([400, 400, 400]);
      expect(await again.text()).toBe(await wrong.text());
      expect((await call("POST", "/api/manage/plugin-link/exchange", { code: 5 })).status).toBe(400);
      expect((await call("POST", "/api/manage/plugin-link/exchange", { code, instanceHost: "bad host/x" })).status).toBe(400);
      expect(token && (await store.getAccess(sha256Hex(token)))).toBeTruthy();
      expect(JSON.stringify(await store.listAccountGrants(acct.id))).not.toContain(token!); // only the hash is stored
    });

    it("an expired code is refused", async () => {
      const mint: any = await (await call("POST", "/api/manage/plugin-link", {}, cookie)).json();
      const taken: any = await store.takeCode(sha256Hex(mint.code));
      await store.putCode(sha256Hex(mint.code), { ...taken.record, expiresAt: Date.now() - 1000 });
      expect((await exchange(mint.code)).status).toBe(400);
    });

    it("the token manages connections without the CSRF header, but cannot call Paperclip tools", async () => {
      const g = await grant(acct.id, ["paperclip:read"], "Claude");
      const { token } = await linked();
      const me: any = await (await call("GET", "/api/manage/me", undefined, undefined, bearer(token!))).json();
      expect(me).toMatchObject({ name: "plink.test1", beta: true });
      const list: any = await (await call("GET", "/api/manage/connections", undefined, undefined, bearer(token!))).json();
      expect(list.connections.map((c: any) => c.id)).toContain(g.id);
      expect(list.connections.some((c: any) => c.app === "Paperclip plugin")).toBe(false); // plugin links are not "apps"
      expect((await call("POST", `/api/manage/connections/${g.id}`, { level: "control" }, undefined, bearer(token!))).status).toBe(200);
      expect((await provider.authenticate(`pcb_at_${g.id}`))!.scopes).toContain("paperclip:control");
      expect((await call("POST", "/api/manage/privacy", { anonymous: false }, undefined, bearer(token!))).status).toBe(200);
      expect((await call("DELETE", `/api/manage/connections/${g.id}`, undefined, undefined, bearer(token!))).status).toBe(200);

      // it is a manage credential only: no MCP, no Paperclip tools, no scopes
      expect(await provider.authenticate(token!)).toBeNull();
      const mcp = await fetch(`${base}/mcp`, { method: "POST", headers: { ...bearer(token!), accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
      expect(mcp.status).toBe(401);
      const grants = (await store.listAccountGrants(acct.id)).filter((x) => x.clientId === "paperclip-plugin");
      expect(grants.every((x) => x.scopes.length === 0)).toBe(true);
    });

    it("the token cannot mint codes, change the beta, sign out, or do anything that needs the secret key", async () => {
      const { token } = await linked();
      for (const [path, body] of [["/plugin-link", {}], ["/beta", { beta: false }], ["/logout", {}], ["/secret/rotate", { secret: acct.secret }], ["/paperclip/disconnect", { secret: acct.secret }], ["/account/delete", { secret: acct.secret, confirm: "plink.test1" }]] as const) {
        const r = await call("POST", `/api/manage${path}`, body, undefined, bearer(token!));
        expect(r.status, path).toBe(403);
      }
      expect(await store.getAccount(acct.id)).toBeTruthy();
      expect((await store.getLink(acct.id))!.sealedCredential).toBe("sealed");
      // and the cookie path still demands the secret key for those
      expect((await call("POST", "/api/manage/secret/rotate", {}, cookie)).status).toBe(403);
    });

    it("rejects unknown, malformed and wrong-kind bearer tokens, even next to a valid cookie", async () => {
      for (const t of ["pcb_pl_" + "x".repeat(43), "pcb_at_whatever", "garbage"]) expect((await call("GET", "/api/manage/me", undefined, cookie, bearer(t))).status, t).toBe(401);
      expect((await call("GET", "/api/manage/me", undefined, cookie, { authorization: "Basic abc" })).status).toBe(401);
      const g = await grant(acct.id, ["paperclip:read"]); // an ordinary MCP access token is not a manage credential
      expect((await call("GET", "/api/manage/me", undefined, undefined, bearer(`pcb_at_${g.id}`))).status).toBe(401);
    });

    it("links can be listed and revoked; a plugin token can only remove itself", async () => {
      const one = await linked();
      const two = await linked();
      const list: any = await (await call("GET", "/api/manage/plugin-links", undefined, cookie)).json();
      expect(list.links.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(list)).not.toMatch(/pcb_pl_|sealed/);
      expect(list.links[0]).toMatchObject({ host: "paperclip.example.com" });

      const mine = ((await (await call("GET", "/api/manage/plugin-links", undefined, undefined, bearer(one.token!))).json()) as any).links.find((l: any) => l.current);
      const other = ((await (await call("GET", "/api/manage/plugin-links", undefined, undefined, bearer(two.token!))).json()) as any).links.find((l: any) => l.current);
      expect((await call("DELETE", `/api/manage/plugin-links/${other.id}`, undefined, undefined, bearer(one.token!))).status).toBe(404);
      expect((await call("GET", "/api/manage/me", undefined, undefined, bearer(two.token!))).status).toBe(200);
      expect((await call("DELETE", "/api/manage/plugin-links/self", undefined, undefined, bearer(one.token!))).status).toBe(200);
      expect((await call("GET", "/api/manage/me", undefined, undefined, bearer(one.token!))).status).toBe(401);
      expect((await call("DELETE", `/api/manage/plugin-links/${mine.id}`, undefined, cookie)).status).toBe(404); // already gone

      // another account can neither see nor revoke it
      const o = await account("plink.other1");
      const oc = (await login("plink.other1", o.secret)).cookie;
      await call("POST", "/api/manage/beta", { beta: true }, oc);
      expect((await call("DELETE", `/api/manage/plugin-links/${other.id}`, undefined, oc)).status).toBe(404);
      expect((await call("DELETE", `/api/manage/plugin-links/${other.id}`, undefined, cookie)).status).toBe(200);
      expect((await call("GET", "/api/manage/me", undefined, undefined, bearer(two.token!))).status).toBe(401);
    });

    it("making a new secret key unlinks every plugin; the old token stops working at once", async () => {
      const { token } = await linked();
      expect((await call("GET", "/api/manage/me", undefined, undefined, bearer(token!))).status).toBe(200);
      const r = await call("POST", "/api/manage/secret/rotate", { secret: acct.secret }, cookie);
      expect(r.status).toBe(200);
      expect((await call("GET", "/api/manage/me", undefined, undefined, bearer(token!))).status).toBe(401);
      expect(await provider.manageListPluginLinks(acct.id)).toEqual([]);
    });
  });

  it("logout clears the cookie", async () => {
    const a = await account("logout.test1");
    const { cookie } = await login("logout.test1", a.secret);
    const r = await call("POST", "/api/manage/logout", {}, cookie);
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  // Last on purpose: it uses up the shared per-address login budget.
  it("signs in with the right secret key only, sets a hardened cookie, and throttles guessing", async () => {
    const a = await account("login.test1");
    const bad = await login("login.test1", "pcs_WRONG-WRONG-WRONG-WRONG");
    expect(bad.r.status).toBe(401);
    expect(((await bad.r.json()) as any).error).toMatch(/don't match/);
    expect((await login("nobody.here1", a.secret)).r.status).toBe(401); // same answer for an unknown name
    const ok = await login("login.test1", a.secret);
    expect(ok.r.status).toBe(200);
    const sc = ok.r.headers.get("set-cookie")!;
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Strict/);
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) codes.push((await login("login.test1", "pcs_WRONG-WRONG-WRONG-WRONG")).r.status);
    expect(codes).toContain(429);
    expect((await login("login.test1", a.secret)).r.status).toBe(429); // even the right key is refused while throttled
  });
});
