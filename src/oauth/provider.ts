import type { IncomingMessage, ServerResponse } from "node:http";
import { PaperclipClient } from "../client.js";
import { hostAllowed, type BridgeConfig, type OAuthConfig } from "../config.js";
import { UnsafeUrlError, createSafeFetch, parseInstanceUrl } from "../net/safe-fetch.js";
import { Keyring, isValidCodeChallenge, randomToken, safeEqual, sha256Hex, verifyPkce } from "./crypto.js";
import { consentPage, errorPage, instancePage } from "./pages.js";
import { LoginError, PaperclipLogin, type Challenge } from "./paperclip-login.js";
import { MemoryStore, type Grant, type PendingRecord, type Store } from "./store.js";
import { SCOPES, isScope, maxRank, scopeAllows, scopesUpTo, type Scope } from "./scopes.js";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PENDING_TTL_MS = 10 * 60_000;
const CODE_TTL_MS = 60_000;
const MAX_PENDING = 5000;
const MAX_INSTANCE_ATTEMPTS = 5;
const MAX_FORM_BYTES = 16 * 1024;
const DAY_MS = 24 * 3600 * 1000;

export interface OAuthDeps {
  config: BridgeConfig;
  oauth: OAuthConfig;
  bridgeToken: string | null;
  store?: Store;
  now?: () => number;
  /** Build the Paperclip login adapter for an instance (null = the single configured one). Tests inject mocks. */
  loginFor?: (instanceUrl: string | null) => PaperclipLogin;
  /** Egress-guarded fetch used for tenant Paperclip instances. */
  safeFetch?: typeof fetch;
}

class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function levelOf(scopes: string[]): Scope {
  return SCOPES[Math.max(0, maxRank(scopes) - 1)];
}

const parseUri = (raw: string): URL | null => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

/** Client address: `hops` entries from the right of X-Forwarded-For (a client can only forge the left side). */
export function clientIp(req: IncomingMessage, hops: number): string {
  if (hops > 0) {
    const xff = req.headers["x-forwarded-for"];
    const parts = (Array.isArray(xff) ? xff.join(",") : xff ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= hops) return parts[parts.length - hops];
  }
  return req.socket.remoteAddress ?? "unknown";
}

export class OAuthProvider {
  readonly resource: string;
  readonly metadataUrl: string;
  readonly store: Store;
  private keyring: Keyring;
  private now: () => number;
  private safeFetch: typeof fetch;
  private multi: boolean;

  constructor(private deps: OAuthDeps) {
    this.now = deps.now ?? Date.now;
    this.store = deps.store ?? new MemoryStore(deps.oauth.dataFile, this.now);
    this.keyring = new Keyring([deps.oauth.secret, ...deps.oauth.previousSecrets]);
    this.multi = deps.oauth.mode === "multi";
    this.safeFetch = deps.safeFetch ?? createSafeFetch({ timeoutMs: deps.config.timeoutMs, maxBytes: 2_000_000 });
    this.resource = `${deps.oauth.issuer}/mcp`;
    this.metadataUrl = `${deps.oauth.issuer}/.well-known/oauth-protected-resource`;
  }

  // ───────────── resource-server side ─────────────

  challengeHeader(error?: "invalid_token" | "insufficient_scope", scope: Scope = "paperclip:read"): string {
    const parts = [`resource_metadata="${this.metadataUrl}"`, `scope="${scope}"`];
    if (error) parts.unshift(`error="${error}"`);
    return `Bearer ${parts.join(", ")}`;
  }

  /** Resolve a presented access token to its (live) grant. */
  async authenticate(token: string): Promise<Grant | null> {
    if (!token.startsWith("pcb_at_")) return null;
    const rec = await this.store.getAccess(sha256Hex(token));
    const grant = rec && (await this.store.getGrant(rec.grantId));
    if (!grant || grant.revoked) return null;
    await this.store.touchGrant(grant.id);
    return grant;
  }

  /** Per-grant call budget, shared across processes. */
  allowCall(grantId: string): Promise<boolean> {
    return this.store.hit(`call:${grantId}`, this.deps.oauth.callsPerMinute, 60_000);
  }

  clientFor(grant: Grant): PaperclipClient {
    const apiKey = grant.sealedCredential ? this.keyring.unseal(grant.sealedCredential) : null;
    if (!this.multi) return new PaperclipClient({ ...this.deps.config, apiKey });
    if (!grant.instanceUrl) throw new Error("Grant has no Paperclip instance");
    const origin = this.checkedInstance(grant.instanceUrl).origin; // re-validated on every use (policy can tighten)
    return new PaperclipClient({ ...this.deps.config, apiUrl: `${origin}/api`, apiKey, companyId: null }, this.safeFetch);
  }

  async listGrants() {
    return (await this.store.listGrants()).filter((g) => !g.revoked);
  }

  async revokeGrant(id: string) {
    const g = await this.store.getGrant(id);
    if (!g) return;
    const sealed = await this.store.revokeGrant(id);
    if (!sealed) return;
    try {
      void this.loginFor(g.instanceUrl).revoke(this.keyring.unseal(sealed));
    } catch {
      /* instance no longer allowed / key gone: nothing more we can do */
    }
  }

  /** Revoke grants unused for `idleRevokeDays` and delete their stored credentials. Run periodically. */
  async sweep(): Promise<number> {
    const days = this.deps.oauth.idleRevokeDays;
    await this.store.prune();
    if (!days) return 0;
    const idle = await this.store.listIdleGrants(this.now() - days * DAY_MS);
    for (const g of idle) await this.revokeGrant(g.id);
    return idle.length;
  }

  /** Re-seal every stored credential with the current key (after rotating BRIDGE_SECRET). */
  async rotateKeys(): Promise<number> {
    let n = 0;
    for (const g of await this.store.listGrants()) {
      if (g.revoked || !g.sealedCredential || !this.keyring.needsRotation(g.sealedCredential)) continue;
      await this.store.putGrant({ ...g, sealedCredential: this.keyring.seal(this.keyring.unseal(g.sealedCredential)) });
      n += 1;
    }
    return n;
  }

  // ───────────── per-tenant plumbing ─────────────

  private checkedInstance(raw: string): URL {
    const u = parseInstanceUrl(raw, this.deps.oauth.instance);
    if (!hostAllowed(u.hostname, this.deps.oauth.instance.allowHosts)) throw new UnsafeUrlError("This service is not open to that host yet.");
    return u;
  }

  private loginFor(instanceUrl: string | null): PaperclipLogin {
    if (this.deps.loginFor) return this.deps.loginFor(instanceUrl);
    const { config, oauth } = this.deps;
    if (!this.multi) {
      return new PaperclipLogin({ apiUrl: config.apiUrl, publicOrigin: oauth.paperclipPublicUrl ?? new URL(config.apiUrl).origin, fetch, timeoutMs: config.timeoutMs });
    }
    if (!instanceUrl) throw new Error("No Paperclip instance chosen");
    const origin = this.checkedInstance(instanceUrl).origin;
    return new PaperclipLogin({ apiUrl: `${origin}/api`, publicOrigin: origin, fetch: this.safeFetch, timeoutMs: config.timeoutMs });
  }

  // ───────────── routing ─────────────

  /** Returns true if the request was an OAuth endpoint and has been answered. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    const m = req.method ?? "GET";
    try {
      if (m === "GET" && (p === "/.well-known/oauth-protected-resource" || p === "/.well-known/oauth-protected-resource/mcp"))
        return this.json(res, 200, this.protectedResourceMetadata());
      if (m === "GET" && p === "/.well-known/oauth-authorization-server") return this.json(res, 200, this.serverMetadata());
      if (m === "POST" && p === "/register") return await this.register(req, res);
      if (m === "GET" && p === "/authorize") return await this.authorize(req, res, url);
      if (m === "GET" && p === "/authorize/status") return await this.authorizeStatus(req, res, url);
      if (m === "POST" && p === "/authorize/instance") return await this.instanceStep(req, res);
      if (m === "POST" && p === "/authorize/decision") return await this.decision(req, res);
      if (m === "POST" && p === "/token") return await this.token(req, res);
      if (m === "POST" && p === "/revoke") return await this.revoke(req, res);
    } catch (err) {
      if (err instanceof OAuthError) {
        this.json(res, err.status, { error: err.code, error_description: err.message });
        return true;
      }
      throw err;
    }
    return false;
  }

  // ───────────── metadata ─────────────

  private protectedResourceMetadata() {
    return {
      resource: this.resource,
      authorization_servers: [this.deps.oauth.issuer],
      scopes_supported: [...SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "Paperclip Bridge",
    };
  }

  private serverMetadata() {
    const i = this.deps.oauth.issuer;
    return {
      issuer: i,
      authorization_endpoint: `${i}/authorize`,
      token_endpoint: `${i}/token`,
      registration_endpoint: `${i}/register`,
      revocation_endpoint: `${i}/revoke`,
      scopes_supported: [...SCOPES, "offline_access"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    };
  }

  // ───────────── helpers ─────────────

  private ip = (req: IncomingMessage) => clientIp(req, this.deps.oauth.proxyHops);
  private limit = (key: string, n: number, windowMs = 60_000) => this.store.hit(key, n, windowMs);

  private json(res: ServerResponse, status: number, body: unknown): true {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache" });
    res.end(JSON.stringify(body));
    return true;
  }

  private html(res: ServerResponse, status: number, body: string, nonce?: string, formOrigin?: string): true {
    res.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; ${nonce ? `script-src 'nonce-${nonce}'; connect-src 'self'; ` : ""}form-action 'self'${formOrigin ? ` ${formOrigin}` : ""}; frame-ancestors 'none'; base-uri 'none'`,
    });
    res.end(body);
    return true;
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let n = 0;
    for await (const c of req) {
      n += (c as Buffer).length;
      if (n > MAX_FORM_BYTES) throw new OAuthError("invalid_request", "Body too large", 413);
      chunks.push(c as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  private async readForm(req: IncomingMessage): Promise<URLSearchParams> {
    if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded"))
      throw new OAuthError("invalid_request", "Content-Type must be application/x-www-form-urlencoded");
    return new URLSearchParams(await this.readBody(req));
  }

  private redirectOk(raw: string): string | null {
    if (raw.length > 512) return "redirect_uri too long";
    const u = parseUri(raw);
    if (!u || u.hash || u.username || u.password) return "redirect_uri is not a valid absolute URI";
    if (u.protocol === "http:" && LOOPBACK.has(u.hostname)) return null;
    if (u.protocol !== "https:") return "redirect_uri must be https (or http on loopback)";
    const hosts = this.deps.oauth.redirectHosts;
    if (hosts.includes("*") || hosts.includes(u.hostname.toLowerCase())) return null;
    return `redirect host ${u.hostname} is not allowed on this bridge (see BRIDGE_OAUTH_REDIRECT_HOSTS)`;
  }

  /** Exact match, except loopback redirects ignore the port (RFC 8252 §7.3). */
  private redirectMatches(registered: string[], presented: string): boolean {
    const p = parseUri(presented);
    return registered.some((r) => {
      if (r === presented) return true;
      const u = parseUri(r);
      return !!u && !!p && u.protocol === "http:" && p.protocol === "http:" && LOOPBACK.has(u.hostname) && u.hostname === p.hostname && u.pathname === p.pathname && u.search === p.search;
    });
  }

  private ownResource = (r: string) => r === this.resource || r === this.deps.oauth.issuer || r === `${this.deps.oauth.issuer}/`;

  private redirectWith(res: ServerResponse, redirectUri: string, params: Record<string, string | undefined>): true {
    const u = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
    u.searchParams.set("iss", this.deps.oauth.issuer);
    res.writeHead(302, { Location: u.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    res.end();
    return true;
  }

  private unsealChallenge(p: PendingRecord): Challenge | null {
    return p.sealedChallenge ? (JSON.parse(this.keyring.unseal(p.sealedChallenge)) as Challenge) : null;
  }

  // ───────────── POST /register (RFC 7591, public clients only) ─────────────

  private async register(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.limit(`reg:${this.ip(req)}`, 20))) throw new OAuthError("invalid_request", "Too many registrations", 429);
    let body: any;
    try {
      body = JSON.parse(await this.readBody(req));
    } catch {
      throw new OAuthError("invalid_client_metadata", "Body must be JSON");
    }
    const uris: unknown = body?.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === "string"))
      throw new OAuthError("invalid_redirect_uri", "redirect_uris must be a non-empty array of strings");
    for (const u of uris as string[]) {
      const why = this.redirectOk(u);
      if (why) throw new OAuthError("invalid_redirect_uri", why);
    }
    if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none")
      throw new OAuthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) are supported");
    const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : "Unnamed application";
    const id = `pcb_c_${randomToken(16)}`;
    const t = this.now();
    await this.store.putClient({ id, name, redirectUris: uris as string[], createdAt: t, lastUsedAt: t });
    return this.json(res, 201, {
      client_id: id,
      client_id_issued_at: Math.floor(t / 1000),
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: SCOPES.join(" "),
    });
  }

  // ───────────── GET /authorize ─────────────

  private async authorize(req: IncomingMessage, res: ServerResponse, url: URL): Promise<true> {
    const q = url.searchParams;
    const client = await this.store.getClient(q.get("client_id") ?? "");
    const redirectUri = q.get("redirect_uri") ?? "";
    // Until client + redirect_uri are trusted we must NOT redirect: show an error page instead.
    if (!client) return this.html(res, 400, errorPage("Unknown application", "This application is not registered with the bridge. Remove and re-add the connector."));
    if (!redirectUri || !this.redirectMatches(client.redirectUris, redirectUri))
      return this.html(res, 400, errorPage("Invalid redirect", "The redirect address does not match the application's registration."));

    const state = q.get("state") ?? undefined;
    const fail = (error: string, description: string) => this.redirectWith(res, redirectUri, { error, error_description: description, state });
    if (q.get("response_type") !== "code") return fail("unsupported_response_type", "response_type must be code");
    const challenge = q.get("code_challenge") ?? "";
    if (!isValidCodeChallenge(challenge) || q.get("code_challenge_method") !== "S256") return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
    const resource = q.get("resource");
    if (resource && !this.ownResource(resource)) return fail("invalid_target", "Unknown resource");

    if (!(await this.limit(`authz:${this.ip(req)}`, 30))) return this.html(res, 429, errorPage("Too many requests", "Please wait a minute and try again."));
    if ((await this.store.countPending()) >= MAX_PENDING) return this.html(res, 503, errorPage("Busy", "Too many sign-ins in progress. Try again shortly."));

    const asked = (q.get("scope") ?? "").split(/\s+/).filter(isScope);
    const requestedMax = asked.length ? levelOf(asked) : "paperclip:read";
    const rid = randomToken(24);
    const p: PendingRecord = { clientId: client.id, clientName: client.name, redirectUri, state, codeChallenge: challenge, requestedMax, csrf: randomToken(24), attempts: 0, expiresAt: this.now() + PENDING_TTL_MS };
    await this.store.touchClient(client.id);

    if (this.multi) {
      await this.store.putPending(rid, p);
      return this.renderInstance(res, rid, p);
    }
    if (this.deps.oauth.login === "paperclip") {
      try {
        // The name shows on Paperclip's approval page; include the real redirect host so a client can't pass itself off as another app.
        const ch = await this.loginFor(null).createChallenge(`${client.name} (via bridge, returns to ${new URL(redirectUri).host})`);
        p.sealedChallenge = this.keyring.seal(JSON.stringify(ch));
      } catch (e) {
        return this.html(res, 502, errorPage("Cannot reach Paperclip", `The bridge could not start a sign-in with Paperclip: ${(e as Error).message}`));
      }
    }
    await this.store.putPending(rid, p);
    return this.renderConsent(res, rid, p, false);
  }

  private renderInstance(res: ServerResponse, rid: string, p: PendingRecord, error?: string, value?: string): true {
    const u = new URL(p.redirectUri);
    return this.html(res, error ? 400 : 200, instancePage({ rid, csrf: p.csrf, clientName: p.clientName, redirectHost: u.host, error, value }), undefined, u.origin);
  }

  private renderConsent(res: ServerResponse, rid: string, p: PendingRecord, approved: boolean, error?: string): true {
    const nonce = randomToken(12);
    const u = new URL(p.redirectUri);
    const ch = this.unsealChallenge(p);
    return this.html(
      res,
      error ? 400 : 200,
      consentPage({
        rid,
        csrf: p.csrf,
        clientName: p.clientName,
        redirectHost: u.host,
        loopbackOnly: u.protocol === "http:" && LOOPBACK.has(u.hostname),
        requestedMax: p.requestedMax as Scope,
        login: this.deps.oauth.login,
        approvalUrl: ch?.approvalUrl,
        approved,
        nonce,
        error,
        instanceHost: p.instanceUrl ? new URL(p.instanceUrl).host : undefined,
      }),
      nonce,
      u.origin,
    );
  }

  private async authorizeStatus(req: IncomingMessage, res: ServerResponse, url: URL): Promise<true> {
    if (!(await this.limit(`stat:${this.ip(req)}`, 120))) return this.json(res, 429, { error: "rate_limited" });
    const p = await this.store.getPending(url.searchParams.get("rid") ?? "");
    const ch = p && this.unsealChallenge(p);
    if (!p || !ch) return this.json(res, 200, { approved: false });
    try {
      return this.json(res, 200, { approved: (await this.loginFor(p.instanceUrl ?? null).status(ch)) === "approved" });
    } catch {
      return this.json(res, 200, { approved: false });
    }
  }

  // ───────────── POST /authorize/instance (multi-tenant) ─────────────

  private async instanceStep(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!this.multi) return this.html(res, 404, errorPage("Not found", "This bridge is bound to a single Paperclip instance."));
    const ip = this.ip(req);
    if (!(await this.limit(`inst:${ip}`, 20))) return this.html(res, 429, errorPage("Too many attempts", "Please wait a minute and try again."));
    const f = await this.readForm(req);
    const rid = f.get("rid") ?? "";
    const p = await this.store.getPending(rid);
    if (!p) return this.html(res, 400, errorPage("Request expired", "This authorization request expired. Start the connection again from the app."));
    if (!safeEqual(f.get("csrf") ?? "", p.csrf)) return this.html(res, 400, errorPage("Invalid request", "Security token mismatch. Start again from the app."));
    if (f.get("action") === "deny") {
      await this.store.deletePending(rid);
      return this.redirectWith(res, p.redirectUri, { error: "access_denied", error_description: "The user cancelled", state: p.state });
    }
    // Each attempt makes the bridge contact a stranger-supplied host: bound them per request and per IP.
    if (p.attempts >= MAX_INSTANCE_ATTEMPTS) {
      await this.store.deletePending(rid);
      return this.html(res, 429, errorPage("Too many attempts", "Too many addresses tried. Start again from the app."));
    }
    p.attempts += 1;
    const typed = (f.get("instance") ?? "").slice(0, 300);

    let origin: URL;
    try {
      origin = this.checkedInstance(typed);
    } catch (e) {
      await this.store.putPending(rid, p);
      return this.renderInstance(res, rid, p, e instanceof UnsafeUrlError ? e.message : "Invalid address.", typed);
    }
    const login = this.loginFor(origin.origin);
    try {
      const probe = await login.probe();
      if (!probe.ok) {
        await this.store.putPending(rid, p);
        return this.renderInstance(res, rid, p, probe.reason, typed);
      }
      const ch = await login.createChallenge(`${p.clientName} (via bridge, returns to ${new URL(p.redirectUri).host})`);
      p.instanceUrl = origin.origin;
      p.sealedChallenge = this.keyring.seal(JSON.stringify(ch));
    } catch (e) {
      await this.store.putPending(rid, p);
      const why = e instanceof LoginError ? e.message : "The bridge could not complete a sign-in with that Paperclip.";
      return this.renderInstance(res, rid, p, why, typed);
    }
    await this.store.putPending(rid, p);
    return this.renderConsent(res, rid, p, false);
  }

  // ───────────── POST /authorize/decision ─────────────

  private async decision(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const ip = this.ip(req);
    if (!(await this.limit(`dec:${ip}`, 20))) return this.html(res, 429, errorPage("Too many attempts", "Please wait a minute and try again."));
    const f = await this.readForm(req);
    const rid = f.get("rid") ?? "";
    const p = await this.store.getPending(rid);
    if (!p) return this.html(res, 400, errorPage("Request expired", "This authorization request expired. Start the connection again from the app."));
    if (!safeEqual(f.get("csrf") ?? "", p.csrf)) return this.html(res, 400, errorPage("Invalid request", "Security token mismatch. Start again from the app."));

    if (f.get("action") === "deny") {
      await this.store.deletePending(rid);
      return this.redirectWith(res, p.redirectUri, { error: "access_denied", error_description: "The user denied the request", state: p.state });
    }
    if (this.multi && !p.instanceUrl) return this.renderInstance(res, rid, p, "Enter your Paperclip address first.");
    const allowed = scopesUpTo(p.requestedMax as Scope);
    const level = (f.get("level") ?? "") as Scope;
    if (!allowed.includes(level)) return this.renderConsent(res, rid, p, false, "Choose an access level.");

    let credential: string | null;
    let userId: string | null = null;
    if (this.deps.oauth.login === "paperclip") {
      const ch = this.unsealChallenge(p)!;
      const login = this.loginFor(p.instanceUrl ?? null);
      let status: Awaited<ReturnType<PaperclipLogin["status"]>>;
      try {
        status = await login.status(ch);
      } catch (e) {
        return this.renderConsent(res, rid, p, false, `Could not check Paperclip: ${(e as Error).message}`);
      }
      if (status === "cancelled" || status === "expired") {
        await this.store.deletePending(rid);
        return this.html(res, 400, errorPage("Sign-in ended", `The Paperclip approval was ${status}. Start the connection again from the app.`));
      }
      if (status !== "approved") return this.renderConsent(res, rid, p, false, "Not approved in Paperclip yet. Approve it in the Paperclip tab, then press Allow again.");
      try {
        userId = (await login.whoami(ch.boardApiToken)).userId;
      } catch (e) {
        return this.renderConsent(res, rid, p, false, `Paperclip did not accept the approved credential: ${(e as Error).message}`);
      }
      credential = ch.boardApiToken;
    } else {
      if (!(await this.limit(`pw:${ip}`, 5))) return this.html(res, 429, errorPage("Too many attempts", "Wait a minute before trying the token again."));
      if (!safeEqual(f.get("password") ?? "", this.deps.bridgeToken ?? "\0")) return this.renderConsent(res, rid, p, false, "Incorrect bridge admin token.");
      credential = this.deps.config.apiKey;
    }

    const code = `pcb_ac_${randomToken(32)}`;
    await this.store.putCode(sha256Hex(code), {
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scopes: scopesUpTo(level),
      clientName: p.clientName,
      userId,
      instanceUrl: p.instanceUrl ?? null,
      sealedCredential: credential ? this.keyring.seal(credential) : null,
      expiresAt: this.now() + CODE_TTL_MS,
    });
    await this.store.deletePending(rid);
    return this.redirectWith(res, p.redirectUri, { code, state: p.state });
  }

  // ───────────── POST /token ─────────────

  private async token(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.limit(`tok:${this.ip(req)}`, 60))) throw new OAuthError("invalid_request", "Rate limited", 429);
    const f = await this.readForm(req);
    switch (f.get("grant_type")) {
      case "authorization_code":
        return this.json(res, 200, await this.exchangeCode(f));
      case "refresh_token":
        return this.json(res, 200, await this.exchangeRefresh(f));
      default:
        throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
    }
  }

  private async exchangeCode(f: URLSearchParams) {
    const hash = sha256Hex(f.get("code") ?? "");
    const taken = await this.store.takeCode(hash);
    if (taken.status === "missing") throw new OAuthError("invalid_grant", "Invalid or expired authorization code");
    if (taken.status === "replay") {
      // Replay of an already-used code: assume theft and kill whatever it produced.
      if (taken.grantId) await this.revokeGrant(taken.grantId);
      throw new OAuthError("invalid_grant", "Authorization code already used");
    }
    const entry = taken.record;
    if (f.get("client_id") !== entry.clientId) throw new OAuthError("invalid_grant", "client_id mismatch");
    if (f.get("redirect_uri") !== entry.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
    if (!verifyPkce(f.get("code_verifier") ?? "", entry.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed");

    const t = this.now();
    const grant: Grant = {
      id: `pcb_g_${randomToken(12)}`,
      clientId: entry.clientId,
      clientName: entry.clientName,
      userId: entry.userId,
      scopes: entry.scopes,
      resource: this.resource,
      instanceUrl: entry.instanceUrl,
      sealedCredential: entry.sealedCredential,
      createdAt: t,
      lastUsedAt: t,
      revoked: false,
    };
    await this.store.putGrant(grant);
    await this.store.setCodeGrant(hash, grant.id);
    return this.issue(grant);
  }

  private async exchangeRefresh(f: URLSearchParams) {
    const hash = sha256Hex(f.get("refresh_token") ?? "");
    const rec = await this.store.getRefresh(hash);
    const grant = rec && (await this.store.getGrant(rec.grantId));
    if (!rec || !grant || grant.revoked) throw new OAuthError("invalid_grant", "Invalid refresh token");
    if (rec.consumed || !(await this.store.consumeRefresh(hash))) {
      await this.revokeGrant(grant.id); // reuse of a rotated token ⇒ treat the whole grant as compromised
      throw new OAuthError("invalid_grant", "Refresh token already used");
    }
    if (f.get("client_id") !== grant.clientId) throw new OAuthError("invalid_grant", "client_id mismatch");
    const asked = (f.get("scope") ?? "").split(/\s+/).filter(Boolean);
    if (asked.some((s) => !isScope(s) || !scopeAllows(grant.scopes, s))) throw new OAuthError("invalid_scope", "Requested scope exceeds the original grant");
    return this.issue(grant);
  }

  private async issue(grant: Grant) {
    const t = this.now();
    const access = `pcb_at_${randomToken(32)}`;
    const refresh = `pcb_rt_${randomToken(32)}`;
    await this.store.putAccess(sha256Hex(access), { grantId: grant.id, expiresAt: t + this.deps.oauth.accessTtlSec * 1000 });
    await this.store.putRefresh(sha256Hex(refresh), { grantId: grant.id, expiresAt: t + this.deps.oauth.refreshTtlSec * 1000 });
    return { access_token: access, token_type: "Bearer", expires_in: this.deps.oauth.accessTtlSec, refresh_token: refresh, scope: grant.scopes.join(" ") };
  }

  // ───────────── POST /revoke (RFC 7009) ─────────────

  private async revoke(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.limit(`rev:${this.ip(req)}`, 30))) throw new OAuthError("invalid_request", "Rate limited", 429);
    const f = await this.readForm(req);
    const rec = await this.store.findAnyToken(sha256Hex(f.get("token") ?? ""));
    if (rec) await this.revokeGrant(rec.grantId);
    return this.json(res, 200, {}); // always 200: don't reveal whether the token existed
  }
}
