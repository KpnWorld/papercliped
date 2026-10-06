import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSecretKey, hashSecretKey, normalizeSecretKey } from "../src/accounts/secret.js";
import { usernameKey } from "../src/accounts/username.js";
import type { BridgeConfig, OAuthConfig } from "../src/config.js";
import { ManageRoutes } from "../src/manage/routes.js";
import { sha256Hex } from "../src/oauth/crypto.js";
import { OAuthProvider } from "../src/oauth/provider.js";
import { MemoryStore, type Grant } from "../src/oauth/store.js";
import { createHttpServer } from "../src/server.js";

let server: Server, base: string, store: MemoryStore, provider: OAuthProvider;
const config: BridgeConfig = { apiUrl: "http://unused.invalid/api", apiKey: null, companyId: null, readOnly: false, timeoutMs: 1000 };

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
const call = (method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  fetch(`${base}${path}`, { method, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
/** What the plugin does to link: sign in once with username + secret key. */
async function signIn(name: string, secret: string, extra: Record<string, unknown> = {}) {
  const r = await call("POST", "/api/manage/plugin-link/sign-in", { username: name, secret, instanceHost: "Paperclip.Example.com", paperclipUserId: "u_1", ...extra });
  const token = r.ok ? (((await r.clone().json()) as any).token as string) : "";
  return { r, token };
}

beforeAll(async () => {
  store = new MemoryStore();
  const oauth: OAuthConfig = {
    issuer: "http://localhost:1", secret: "s".repeat(40), previousSecrets: [], mode: "multi", accounts: true, login: "paperclip", dataFile: null, database: null,
    paperclipPublicUrl: null, accessTtlSec: 3600, refreshTtlSec: 86400 * 40, idleRevokeDays: 30, callsPerMinute: 120, redirectHosts: ["claude.ai"], proxyHops: 0,
    instance: { allowedPorts: [443], denyHosts: ["localhost"], allowHosts: null },
  };
  provider = new OAuthProvider({ config, oauth, bridgeToken: null, store });
  server = createHttpServer(config, { host: "127.0.0.1", port: 0, bridgeToken: null, publicUrl: oauth.issuer, oauth } as any, { oauth: provider, manage: new ManageRoutes(provider) });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("manage API (used by the Paperclip plugin)", () => {
  it("the old /manage page sends people to the plugin docs", async () => {
    const res = await fetch(`${base}/manage`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/docs/paperclip-plugin");
  });

  it("everything needs a plugin token; there is no cookie sign-in any more", async () => {
    expect((await call("GET", "/api/manage/me")).status).toBe(401);
    expect((await call("GET", "/api/manage/connections")).status).toBe(401);
    const a = await account("nocookie.test1");
    expect((await call("POST", "/api/manage/login", { username: "nocookie.test1", secret: a.secret })).status).toBe(401);
    for (const t of ["pcb_pl_" + "x".repeat(43), "pcb_at_whatever", "garbage"]) expect((await call("GET", "/api/manage/me", undefined, t)).status, t).toBe(401);
    expect((await call("GET", "/api/manage/me", undefined, undefined, { authorization: "Basic abc" })).status).toBe(401);
    const g = await grant(a.id, ["paperclip:read"]); // an ordinary MCP access token is not a manage credential
    expect((await call("GET", "/api/manage/me", undefined, `pcb_at_${g.id}`)).status).toBe(401);
  });

  it("signing in links the plugin: the token is stored only as a hash and is a manage credential only", async () => {
    const a = await account("plink.test1");
    const { r, token } = await signIn("plink.test1", a.secret);
    expect(r.status).toBe(200);
    expect(token).toMatch(/^pcb_pl_/);
    expect(await store.getAccess(sha256Hex(token))).toBeTruthy();
    expect(JSON.stringify(await store.listAccountGrants(a.id))).not.toContain(token);
    expect(JSON.stringify(await store.listAccountGrants(a.id))).not.toContain(a.secret);
    const me: any = await (await call("GET", "/api/manage/me", undefined, token)).json();
    expect(me).toMatchObject({ name: "plink.test1", paperclip: "paperclip.example.com", connected: true });
    expect(me).not.toHaveProperty("beta"); // no beta gate: everyone who links can manage
    // no MCP, no Paperclip tools, no scopes
    expect(await provider.authenticate(token)).toBeNull();
    const mcp = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(mcp.status).toBe(401);
    expect((await store.listAccountGrants(a.id)).filter((x) => x.clientId === "paperclip-plugin").every((x) => x.scopes.length === 0)).toBe(true);
    // bad metadata is refused before any password check
    expect((await call("POST", "/api/manage/plugin-link/sign-in", { username: "plink.test1", secret: a.secret, instanceHost: "bad host/x" })).status).toBe(400);
    expect((await call("POST", "/api/manage/plugin-link/sign-in", "nope", undefined, { "content-type": "text/plain" })).status).toBe(400);
  });

  it("lists only your own connections and changes access immediately, with two levels", async () => {
    const a = await account("levels.test1");
    const other = await account("levels.other1");
    const mine = await grant(a.id, ["paperclip:read"], "Claude");
    const admin = await grant(a.id, ["paperclip:read", "paperclip:control", "paperclip:admin"], "Claude Code");
    const theirs = await grant(other.id, ["paperclip:read"], "ChatGPT");
    const { token } = await signIn("levels.test1", a.secret);

    const list: any = await (await call("GET", "/api/manage/connections", undefined, token)).json();
    expect(list.connections.map((c: any) => c.app).sort()).toEqual(["Claude", "Claude Code"]); // plugin links are not "apps"
    expect(JSON.stringify(list)).not.toMatch(/sealed|credential|pcb_/);
    expect(list.connections.find((c: any) => c.id === admin.id).level).toBe("paperclip:control"); // an old admin grant shows as Full control

    // someone else's connection is "not found", not "forbidden": it does not even confirm it exists
    expect((await call("POST", `/api/manage/connections/${theirs.id}`, { level: "control" }, token)).status).toBe(404);
    expect((await call("DELETE", `/api/manage/connections/${theirs.id}`, undefined, token)).status).toBe(404);
    expect((await store.getGrant(theirs.id))!.revoked).toBe(false);

    // read → control takes effect on the very next authenticated call
    expect((await call("POST", `/api/manage/connections/${mine.id}`, { level: "control" }, token)).status).toBe(200);
    expect((await provider.authenticate(`pcb_at_${mine.id}`))!.scopes).toEqual(["paperclip:read", "paperclip:control"]);
    expect((await call("POST", `/api/manage/connections/${mine.id}`, { level: "read" }, token)).status).toBe(200);
    expect((await provider.authenticate(`pcb_at_${mine.id}`))!.scopes).toEqual(["paperclip:read"]);

    // only "read" and "control" exist; an old admin grant can be lowered like any other
    expect((await call("POST", `/api/manage/connections/${mine.id}`, { level: "admin" }, token)).status).toBe(400);
    expect((await call("POST", `/api/manage/connections/${admin.id}`, { level: "read" }, token)).status).toBe(200);
    expect((await call("POST", `/api/manage/connections/${admin.id}`, { level: "bogus" }, token)).status).toBe(400);

    // disconnecting cuts the app off at once
    expect((await call("DELETE", `/api/manage/connections/${mine.id}`, undefined, token)).status).toBe(200);
    expect(await provider.authenticate(`pcb_at_${mine.id}`)).toBeNull();
    expect((await call("POST", `/api/manage/connections/${mine.id}`, { level: "control" }, token)).status).toBe(404);
  });

  it("anonymity: the logs show the alias, never the real name", async () => {
    const a = await account("anon.test1");
    const { token } = await signIn("anon.test1", a.secret);
    const r: any = await (await call("POST", "/api/manage/privacy", { anonymous: true }, token)).json();
    expect(r.anonymous).toBe(true);
    expect(r.alias).toMatch(/^[A-Za-z]+\d\d$/);
    expect(r.name).toBe(r.alias);
    const events = await store.userEventsRecent(0, 500);
    expect(events.filter((e) => e.accountId === a.id && e.detail !== "manager").every((e) => e.username === r.alias)).toBe(true);
    expect((await call("POST", "/api/manage/privacy", { anonymous: "yes" }, token)).status).toBe(400);
  });

  it("links can be listed and removed, and another account can't touch them", async () => {
    const a = await account("links.test1");
    const one = await signIn("links.test1", a.secret);
    const two = await signIn("links.test1", a.secret, { instanceHost: "other.example.com" });
    const list: any = await (await call("GET", "/api/manage/plugin-links", undefined, one.token)).json();
    expect(list.links).toHaveLength(2);
    expect(JSON.stringify(list)).not.toMatch(/pcb_pl_|sealed|u_1/);
    expect(list.links.find((l: any) => l.current)).toMatchObject({ host: "paperclip.example.com" });
    const otherLink = list.links.find((l: any) => !l.current);

    const o = await account("links.other1");
    const ot = (await signIn("links.other1", o.secret)).token;
    expect((await call("DELETE", `/api/manage/plugin-links/${otherLink.id}`, undefined, ot)).status).toBe(404);

    // you can remove another of your own links (e.g. an old Paperclip), or this one
    expect((await call("DELETE", `/api/manage/plugin-links/${otherLink.id}`, undefined, one.token)).status).toBe(200);
    expect((await call("GET", "/api/manage/me", undefined, two.token)).status).toBe(401);
    expect((await call("DELETE", "/api/manage/plugin-links/self", undefined, one.token)).status).toBe(200);
    expect((await call("GET", "/api/manage/me", undefined, one.token)).status).toBe(401);
  });

  it("a new secret key needs the old one, unlinks every other plugin, and keeps this one linked with a fresh token", async () => {
    const a = await account("rotate.test1");
    const here = await signIn("rotate.test1", a.secret);
    const elsewhere = await signIn("rotate.test1", a.secret, { instanceHost: "other.example.com" });
    expect((await call("POST", "/api/manage/secret/rotate", {}, here.token)).status).toBe(403);
    expect((await call("POST", "/api/manage/secret/rotate", { secret: "pcs_WRONG-WRONG-WRONG-WRONG" }, here.token)).status).toBe(403);
    const r = await call("POST", "/api/manage/secret/rotate", { secret: a.secret }, here.token);
    expect(r.status).toBe(200);
    const j: any = await r.json();
    expect(j.secret).toMatch(/^pcs_/);
    expect(j.token).toMatch(/^pcb_pl_/);
    expect((await call("GET", "/api/manage/me", undefined, here.token)).status).toBe(401); // old tokens die
    expect((await call("GET", "/api/manage/me", undefined, elsewhere.token)).status).toBe(401);
    expect((await call("GET", "/api/manage/me", undefined, j.token)).status).toBe(200); // this plugin carries on
    const links = await provider.manageListPluginLinks(a.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ host: "paperclip.example.com", paperclipUserId: "u_1" });
    expect((await signIn("rotate.test1", a.secret)).r.status).toBe(401); // the old key is dead
  });

  it("disconnecting your Paperclip forgets the key and cuts every app; deleting the account needs the username", async () => {
    const a = await account("danger.test1");
    const g = await grant(a.id, ["paperclip:read"]);
    const { token } = await signIn("danger.test1", a.secret);
    expect((await call("POST", "/api/manage/paperclip/disconnect", { secret: "pcs_WRONG-WRONG-WRONG-WRONG" }, token)).status).toBe(403);
    expect((await call("POST", "/api/manage/paperclip/disconnect", { secret: a.secret }, token)).status).toBe(200);
    expect((await store.getLink(a.id))!.sealedCredential).toBeNull();
    expect(await provider.authenticate(`pcb_at_${g.id}`)).toBeNull();
    // the plugin link is a grant too, so it is cut with the rest
    expect((await call("GET", "/api/manage/me", undefined, token)).status).toBe(401);

    const again = (await signIn("danger.test1", a.secret)).token;
    expect(((await (await call("GET", "/api/manage/me", undefined, again)).json()) as any).connected).toBe(false);
    expect((await call("POST", "/api/manage/account/delete", { secret: a.secret, confirm: "wrong" }, again)).status).toBe(400);
    expect(await store.getAccount(a.id)).toBeTruthy();
    expect((await call("POST", "/api/manage/account/delete", { secret: a.secret, confirm: "Danger.Test1" }, again)).status).toBe(200);
    expect(await store.getAccount(a.id)).toBeUndefined();
  });

  // Last on purpose: it uses up the shared per-address sign-in budget.
  it("signs in with the right secret key only, and throttles guessing", async () => {
    const a = await account("login.test1");
    const bad = await signIn("login.test1", "pcs_WRONG-WRONG-WRONG-WRONG");
    expect(bad.r.status).toBe(401);
    expect(((await bad.r.json()) as any).error).toMatch(/don't match/);
    expect((await signIn("nobody.here1", a.secret)).r.status).toBe(401); // same answer for an unknown name
    expect((await signIn("login.test1", a.secret)).r.status).toBe(200);
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) codes.push((await signIn("login.test1", "pcs_WRONG-WRONG-WRONG-WRONG")).r.status);
    expect(codes).toContain(429);
    expect((await signIn("login.test1", a.secret)).r.status).toBe(429); // even the right key is refused while throttled
  });
});
