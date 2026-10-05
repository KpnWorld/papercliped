import type { IncomingMessage, ServerResponse } from "node:http";
import { PaperclipClient } from "../client.js";
import type { BridgeConfig, OAuthConfig } from "../config.js";
import { deriveKey, isValidCodeChallenge, randomToken, safeEqual, seal, sha256Hex, unseal, verifyPkce } from "./crypto.js";
import { consentPage, errorPage } from "./pages.js";
import { PaperclipLogin, type Challenge } from "./paperclip-login.js";
import { RateLimiter } from "./ratelimit.js";
import { SCOPES, isScope, maxRank, scopeAllows, scopesUpTo, type Scope } from "./scopes.js";
import { OAuthStore, type Grant } from "./store.js";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PENDING_TTL_MS = 10 * 60_000;
const CODE_TTL_MS = 60_000;
const MAX_PENDING = 500;
const MAX_FORM_BYTES = 16 * 1024;

interface Pending {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  requestedMax: Scope;
  csrf: string;
  challenge?: Challenge;
  expiresAt: number;
}

interface CodeEntry {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  clientName: string;
  userId: string | null;
  sealedCredential: string | null;
  expiresAt: number;
  grantId?: string; // set once exchanged; a second exchange is a replay
}

export interface OAuthDeps {
  config: BridgeConfig;
  oauth: OAuthConfig;
  bridgeToken: string | null;
  store?: OAuthStore;
  login?: PaperclipLogin;
  now?: () => number;
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
  const r = maxRank(scopes);
  return SCOPES[Math.max(0, r - 1)];
}

function parseUri(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export class OAuthProvider {
  readonly resource: string;
  readonly metadataUrl: string;
  private store: OAuthStore;
  private login: PaperclipLogin;
  private key: Buffer;
  private now: () => number;
  private pending = new Map<string, Pending>();
  private codes = new Map<string, CodeEntry>();
  private limiter: RateLimiter;

  constructor(private deps: OAuthDeps) {
    this.now = deps.now ?? Date.now;
    this.store = deps.store ?? new OAuthStore(deps.oauth.dataFile, this.now);
    this.login = deps.login ?? new PaperclipLogin(deps.config, deps.oauth);
    this.key = deriveKey(deps.oauth.secret);
    this.limiter = new RateLimiter(this.now);
    this.resource = `${deps.oauth.issuer}/mcp`;
    this.metadataUrl = `${deps.oauth.issuer}/.well-known/oauth-protected-resource`;
  }

  // ───────────── resource-server side ─────────────

  /** `WWW-Authenticate` value for 401/403 responses. */
  challengeHeader(error?: "invalid_token" | "insufficient_scope", scope: Scope = "paperclip:read"): string {
    const parts = [`resource_metadata="${this.metadataUrl}"`, `scope="${scope}"`];
    if (error) parts.unshift(`error="${error}"`);
    return `Bearer ${parts.join(", ")}`;
  }

  /** Resolve a presented access token to its (live) grant. */
  authenticate(token: string): Grant | null {
    if (!token.startsWith("pcb_at_")) return null;
    const rec = this.store.getAccess(sha256Hex(token));
    const grant = rec && this.store.getGrant(rec.grantId);
    if (!grant || grant.revoked) return null;
    this.store.touchGrant(grant.id);
    return grant;
  }

  clientFor(grant: Grant): PaperclipClient {
    const apiKey = grant.sealedCredential ? unseal(this.key, grant.sealedCredential) : null;
    return new PaperclipClient({ ...this.deps.config, apiKey });
  }

  listGrants() {
    return this.store.listGrants().filter((g) => !g.revoked);
  }

  revokeGrant(id: string) {
    const g = this.store.getGrant(id);
    if (!g) return;
    const cred = g.sealedCredential ? unseal(this.key, g.sealedCredential) : null;
    this.store.revokeGrant(id);
    if (cred && this.deps.oauth.login === "paperclip") void this.login.revoke(cred);
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

  private ip(req: IncomingMessage): string {
    if (this.deps.oauth.trustProxy) {
      const xff = req.headers["x-forwarded-for"];
      const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? "unknown";
  }

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

  private ownResource(r: string) {
    return r === this.resource || r === this.deps.oauth.issuer || r === `${this.deps.oauth.issuer}/`;
  }

  private redirectWith(res: ServerResponse, redirectUri: string, params: Record<string, string | undefined>): true {
    const u = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
    u.searchParams.set("iss", this.deps.oauth.issuer);
    res.writeHead(302, { Location: u.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    res.end();
    return true;
  }

  private prunePending() {
    const t = this.now();
    for (const [k, v] of this.pending) if (v.expiresAt <= t) this.pending.delete(k);
    for (const [k, v] of this.codes) if (v.expiresAt + 5 * 60_000 <= t) this.codes.delete(k);
  }

  // ───────────── POST /register (RFC 7591, public clients only) ─────────────

  private async register(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!this.limiter.allow(`reg:${this.ip(req)}`, 20, 60_000)) throw new OAuthError("invalid_request", "Too many registrations", 429);
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
    this.store.putClient({ id, name, redirectUris: uris as string[], createdAt: t, lastUsedAt: t });
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
    const client = this.store.getClient(q.get("client_id") ?? "");
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

    if (!this.limiter.allow(`authz:${this.ip(req)}`, 30, 60_000)) return this.html(res, 429, errorPage("Too many requests", "Please wait a minute and try again."));
    this.prunePending();
    if (this.pending.size >= MAX_PENDING) return this.html(res, 503, errorPage("Busy", "Too many sign-ins in progress. Try again shortly."));

    const asked = (q.get("scope") ?? "").split(/\s+/).filter(isScope);
    const requestedMax = asked.length ? levelOf(asked) : "paperclip:read";

    let ch: Challenge | undefined;
    if (this.deps.oauth.login === "paperclip") {
      try {
        // The name shows on Paperclip's approval page; include the real redirect host so a client can't pass itself off as another app.
        ch = await this.login.createChallenge(`${client.name} (via bridge, returns to ${new URL(redirectUri).host})`);
      } catch (e) {
        return this.html(res, 502, errorPage("Cannot reach Paperclip", `The bridge could not start a sign-in with Paperclip: ${(e as Error).message}`));
      }
    }
    this.store.touchClient(client.id);
    const rid = randomToken(24);
    const p: Pending = { clientId: client.id, clientName: client.name, redirectUri, state, codeChallenge: challenge, requestedMax, csrf: randomToken(24), challenge: ch, expiresAt: this.now() + PENDING_TTL_MS };
    this.pending.set(rid, p);
    return this.renderConsent(res, rid, p, false);
  }

  private renderConsent(res: ServerResponse, rid: string, p: Pending, approved: boolean, error?: string): true {
    const nonce = randomToken(12);
    const u = new URL(p.redirectUri);
    return this.html(
      res,
      error ? 400 : 200,
      consentPage({
        rid,
        csrf: p.csrf,
        clientName: p.clientName,
        redirectHost: u.host,
        loopbackOnly: u.protocol === "http:" && LOOPBACK.has(u.hostname),
        requestedMax: p.requestedMax,
        login: this.deps.oauth.login,
        approvalUrl: p.challenge?.approvalUrl,
        approved,
        nonce,
        error,
      }),
      nonce,
      u.origin,
    );
  }

  private async authorizeStatus(req: IncomingMessage, res: ServerResponse, url: URL): Promise<true> {
    if (!this.limiter.allow(`stat:${this.ip(req)}`, 120, 60_000)) return this.json(res, 429, { error: "rate_limited" });
    const p = this.pending.get(url.searchParams.get("rid") ?? "");
    if (!p?.challenge || p.expiresAt <= this.now()) return this.json(res, 200, { approved: false });
    try {
      return this.json(res, 200, { approved: (await this.login.status(p.challenge)) === "approved" });
    } catch {
      return this.json(res, 200, { approved: false });
    }
  }

  // ───────────── POST /authorize/decision ─────────────

  private async decision(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const ip = this.ip(req);
    if (!this.limiter.allow(`dec:${ip}`, 20, 60_000)) return this.html(res, 429, errorPage("Too many attempts", "Please wait a minute and try again."));
    const f = await this.readForm(req);
    const rid = f.get("rid") ?? "";
    const p = this.pending.get(rid);
    if (!p || p.expiresAt <= this.now()) {
      this.pending.delete(rid);
      return this.html(res, 400, errorPage("Request expired", "This authorization request expired. Start the connection again from the app."));
    }
    if (!safeEqual(f.get("csrf") ?? "", p.csrf)) return this.html(res, 400, errorPage("Invalid request", "Security token mismatch. Start again from the app."));

    if (f.get("action") === "deny") {
      this.pending.delete(rid);
      return this.redirectWith(res, p.redirectUri, { error: "access_denied", error_description: "The user denied the request", state: p.state });
    }
    const allowed = scopesUpTo(p.requestedMax);
    const level = (f.get("level") ?? "") as Scope;
    if (!allowed.includes(level)) return this.renderConsent(res, rid, p, false, "Choose an access level.");

    let credential: string | null;
    let userId: string | null = null;
    if (this.deps.oauth.login === "paperclip") {
      const ch = p.challenge!;
      let status: Awaited<ReturnType<PaperclipLogin["status"]>>;
      try {
        status = await this.login.status(ch);
      } catch (e) {
        return this.renderConsent(res, rid, p, false, `Could not check Paperclip: ${(e as Error).message}`);
      }
      if (status === "cancelled" || status === "expired") {
        this.pending.delete(rid);
        return this.html(res, 400, errorPage("Sign-in ended", `The Paperclip approval was ${status}. Start the connection again from the app.`));
      }
      if (status !== "approved") return this.renderConsent(res, rid, p, false, "Not approved in Paperclip yet. Approve it in the Paperclip tab, then press Allow again.");
      try {
        userId = (await this.login.whoami(ch.boardApiToken)).userId;
      } catch (e) {
        return this.renderConsent(res, rid, p, false, `Paperclip did not accept the approved credential: ${(e as Error).message}`);
      }
      credential = ch.boardApiToken;
    } else {
      if (!this.limiter.allow(`pw:${ip}`, 5, 60_000)) return this.html(res, 429, errorPage("Too many attempts", "Wait a minute before trying the token again."));
      if (!safeEqual(f.get("password") ?? "", this.deps.bridgeToken ?? "\0")) return this.renderConsent(res, rid, p, false, "Incorrect bridge admin token.");
      credential = this.deps.config.apiKey;
    }

    const code = `pcb_ac_${randomToken(32)}`;
    this.codes.set(sha256Hex(code), {
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scopes: scopesUpTo(level),
      clientName: p.clientName,
      userId,
      sealedCredential: credential ? seal(this.key, credential) : null,
      expiresAt: this.now() + CODE_TTL_MS,
    });
    this.pending.delete(rid);
    return this.redirectWith(res, p.redirectUri, { code, state: p.state });
  }

  // ───────────── POST /token ─────────────

  private async token(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!this.limiter.allow(`tok:${this.ip(req)}`, 60, 60_000)) throw new OAuthError("invalid_request", "Rate limited", 429);
    const f = await this.readForm(req);
    switch (f.get("grant_type")) {
      case "authorization_code":
        return this.json(res, 200, this.exchangeCode(f));
      case "refresh_token":
        return this.json(res, 200, this.exchangeRefresh(f));
      default:
        throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
    }
  }

  private exchangeCode(f: URLSearchParams) {
    const code = f.get("code") ?? "";
    const entry = this.codes.get(sha256Hex(code));
    if (!entry || (!entry.grantId && entry.expiresAt <= this.now())) throw new OAuthError("invalid_grant", "Invalid or expired authorization code");
    if (entry.grantId) {
      // Replay of an already-used code: assume theft and kill whatever it produced.
      this.revokeGrant(entry.grantId);
      throw new OAuthError("invalid_grant", "Authorization code already used");
    }
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
      sealedCredential: entry.sealedCredential,
      createdAt: t,
      lastUsedAt: t,
      revoked: false,
    };
    entry.grantId = grant.id;
    entry.sealedCredential = null;
    this.store.putGrant(grant);
    return this.issue(grant);
  }

  private exchangeRefresh(f: URLSearchParams) {
    const hash = sha256Hex(f.get("refresh_token") ?? "");
    const rec = this.store.getRefresh(hash);
    const grant = rec && this.store.getGrant(rec.grantId);
    if (!rec || !grant || grant.revoked) throw new OAuthError("invalid_grant", "Invalid refresh token");
    if (rec.consumed) {
      this.revokeGrant(grant.id); // reuse of a rotated token ⇒ treat the whole grant as compromised
      throw new OAuthError("invalid_grant", "Refresh token already used");
    }
    if (f.get("client_id") !== grant.clientId) throw new OAuthError("invalid_grant", "client_id mismatch");
    const asked = (f.get("scope") ?? "").split(/\s+/).filter(Boolean);
    if (asked.some((s) => !isScope(s) || !scopeAllows(grant.scopes, s))) throw new OAuthError("invalid_scope", "Requested scope exceeds the original grant");
    this.store.consumeRefresh(hash);
    return this.issue(grant);
  }

  private issue(grant: Grant) {
    const t = this.now();
    const access = `pcb_at_${randomToken(32)}`;
    const refresh = `pcb_rt_${randomToken(32)}`;
    this.store.putAccess(sha256Hex(access), { grantId: grant.id, expiresAt: t + this.deps.oauth.accessTtlSec * 1000 });
    this.store.putRefresh(sha256Hex(refresh), { grantId: grant.id, expiresAt: t + this.deps.oauth.refreshTtlSec * 1000 });
    return { access_token: access, token_type: "Bearer", expires_in: this.deps.oauth.accessTtlSec, refresh_token: refresh, scope: grant.scopes.join(" ") };
  }

  // ───────────── POST /revoke (RFC 7009) ─────────────

  private async revoke(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!this.limiter.allow(`rev:${this.ip(req)}`, 30, 60_000)) throw new OAuthError("invalid_request", "Rate limited", 429);
    const f = await this.readForm(req);
    const rec = this.store.findAnyToken(sha256Hex(f.get("token") ?? ""));
    if (rec) this.revokeGrant(rec.grantId);
    return this.json(res, 200, {}); // always 200: don't reveal whether the token existed
  }
}
