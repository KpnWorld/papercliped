import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { displayName } from "../accounts/alias.js";
import type { Account } from "../accounts/types.js";
import { randomToken, sha256Hex } from "../oauth/crypto.js";
import type { OAuthProvider } from "../oauth/provider.js";
import type { Scope } from "../oauth/scopes.js";
import { managePage } from "./page.js";

const COOKIE = "pcp_manage";
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

/** A DNS name or IPv4 literal, optionally with a port; undefined when it is anything else. */
function cleanHost(v: unknown): string | null | undefined {
  if (typeof v !== "string") return undefined;
  const h = v.trim().toLowerCase();
  if (!h) return null;
  if (h.length > 255 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(h)) return undefined;
  try {
    return new URL(`https://${h}`).host;
  } catch {
    return undefined;
  }
}

export interface ManageOptions {
  secureCookie: boolean;
  sessionHours?: number;
  now?: () => number;
}

/**
 * The connection manager for beta accounts: sign in with username + secret key, then see every connected app, change what each
 * may do, disconnect, switch anonymity, rotate the secret key, or disconnect/delete everything. Every action is limited to the
 * signed-in account; sensitive ones ask for the secret key again.
 *
 * CSRF: the session cookie is SameSite=Strict, and every state-changing call must be JSON with a custom header, which a
 * cross-site page cannot send without a CORS preflight (which we never approve).
 */
export class ManageRoutes {
  private key: Buffer;
  private now: () => number;
  private ttl: number;

  constructor(private p: OAuthProvider, private o: ManageOptions) {
    this.key = p.manageSigningKey();
    this.now = o.now ?? Date.now;
    this.ttl = (o.sessionHours ?? 8) * 3600;
  }

  private fp(a: Account) {
    return sha256Hex(a.secretHash).slice(0, 12);
  }
  private mac(accountId: string, exp: number, fp: string) {
    return createHmac("sha256", this.key).update(`${accountId}|${exp}|${fp}`).digest("base64url");
  }
  private cookie(a: Account | null): string {
    if (!a) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${this.o.secureCookie ? "; Secure" : ""}`;
    const exp = Math.floor(this.now() / 1000) + this.ttl;
    const fp = this.fp(a);
    return `${COOKIE}=${a.id}~${exp}~${fp}~${this.mac(a.id, exp, fp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${this.ttl}${this.o.secureCookie ? "; Secure" : ""}`;
  }

  private async session(req: IncomingMessage): Promise<Account | null> {
    const m = new RegExp(`(?:^|; )${COOKIE}=([^;]+)`).exec(req.headers.cookie ?? "");
    if (!m) return null;
    const [id, exp, fp, mac] = m[1].split("~");
    if (!id || !exp || !fp || !mac || Number(exp) * 1000 < this.now()) return null;
    const want = Buffer.from(this.mac(id, Number(exp), fp));
    const got = Buffer.from(mac);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const a = await this.p.manageAccount(id);
    // Changing the secret key changes the fingerprint, which ends every session signed with the old one.
    return a && !a.disabled && this.fp(a) === fp ? a : null;
  }

  private send(res: ServerResponse, status: number, body: string, type: string, extra: Record<string, string> = {}): true {
    res.writeHead(status, { "Content-Type": type, ...HEADERS, ...extra });
    res.end(body);
    return true;
  }
  private json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): true {
    return this.send(res, status, JSON.stringify(body), "application/json", extra);
  }

  private async body(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    if (!/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))) return null;
    let raw = "";
    for await (const c of req) {
      raw += c;
      if (raw.length > 8192) return null;
    }
    try {
      const j = JSON.parse(raw || "{}");
      return j && typeof j === "object" && !Array.isArray(j) ? j : null;
    } catch {
      return null;
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const m = req.method ?? "GET";
    if (m === "GET" && path === "/manage") {
      const nonce = randomToken(12);
      return this.send(res, 200, managePage(nonce), "text/html; charset=utf-8", {
        "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      });
    }
    if (!path.startsWith("/api/manage")) return false;

    const authz = String(req.headers.authorization ?? "");
    const bearer = /^Bearer\s+(\S+)$/i.exec(authz)?.[1] ?? null;
    if (authz && !bearer) return this.json(res, 401, { error: "Unsupported Authorization header" });

    // A bearer token cannot be attached by a cross-site page without a CORS preflight, so it needs no CSRF header.
    if (m !== "GET" && !bearer) {
      // CSRF guard (see class comment).
      if (req.headers["x-papercliped"] !== "1") return this.json(res, 400, { error: "Missing request header" });
    }
    const route = path.slice("/api/manage".length) || "/";

    if (m === "POST" && route === "/login" && !bearer) {
      const b = await this.body(req);
      if (!b) return this.json(res, 400, { error: "Send JSON" });
      const r = await this.p.manageLogin(req, String(b.username ?? ""), String(b.secret ?? ""));
      if (!r.ok) return r.reason === "throttled" ? this.json(res, 429, { error: "Too many attempts. Wait a few minutes." }) : this.json(res, 401, { error: "That username and secret key don't match." });
      return this.json(res, 200, { ok: true }, { "Set-Cookie": this.cookie(r.account) });
    }

    // The plugin trades its one-time code for a token; there is no session yet. The provider rate-limits by address and answers
    // wrong, used and expired codes identically.
    if (m === "POST" && route === "/plugin-link/exchange" && !bearer) {
      const b = await this.body(req);
      if (!b || typeof b.code !== "string") return this.json(res, 400, { error: "Send JSON with a code" });
      const host = b.instanceHost == null ? null : cleanHost(b.instanceHost);
      const uid = b.paperclipUserId == null ? null : typeof b.paperclipUserId === "string" && b.paperclipUserId.length <= 100 ? b.paperclipUserId : undefined;
      if (host === undefined || uid === undefined) return this.json(res, 400, { error: "Invalid instanceHost or paperclipUserId" });
      const r = await this.p.manageExchangeLinkCode(req, b.code, { instanceHost: host, paperclipUserId: uid });
      return r ? this.json(res, 200, { token: r.token }) : this.json(res, 400, { error: "That code is not valid. Codes work once and expire after 10 minutes." });
    }

    let a: Account | null;
    let linkId: string | null = null;
    if (bearer) {
      const pr = await this.p.managePluginPrincipal(bearer);
      a = pr?.account ?? null;
      linkId = pr?.linkId ?? null;
      if (!a) return this.json(res, 401, { error: "Link the plugin again" });
    } else {
      a = await this.session(req);
      if (!a) return this.json(res, 401, { error: "Sign in first" });
    }
    if (!(await this.p.store.hit(`manage:${a.id}`, 120, 60_000))) return this.json(res, 429, { error: "Slow down" });

    // A plugin token may manage connections and privacy, and unlink itself. It may not sign out, change the beta, mint link codes
    // or do anything that needs the secret key (those need the browser session).
    const cookieOnly = new Set(["/logout", "/beta", "/plugin-link", "/secret/rotate", "/paperclip/disconnect", "/account/delete"]);
    if (bearer && cookieOnly.has(route)) return this.json(res, 403, { error: "Do this in the browser at /manage", code: "browser_required" });

    if (m === "POST" && route === "/logout") return this.json(res, 200, { ok: true }, { "Set-Cookie": this.cookie(null) });

    if (m === "GET" && route === "/me") {
      const link = await this.p.manageInstanceLabel(a.id);
      return this.json(res, 200, { name: displayName(a), anonymous: !!a.anonymous, alias: a.alias ?? null, beta: !!a.beta, paperclip: link.label, connected: link.connected, createdAt: a.createdAt });
    }
    if (m === "POST" && route === "/beta") {
      const b = await this.body(req);
      if (!b || typeof b.beta !== "boolean") return this.json(res, 400, { error: "beta must be true or false" });
      await this.p.manageSetBeta(a, b.beta);
      return this.json(res, 200, { beta: b.beta });
    }

    // Everything below is part of the beta.
    if (!a.beta) return this.json(res, 403, { error: "Join the beta to use the connection manager", code: "beta_required" });

    if (m === "GET" && route === "/connections") return this.json(res, 200, { connections: await this.p.manageConnections(a.id) });

    const c = /^\/connections\/([A-Za-z0-9_-]{1,80})$/.exec(route);
    if (c && m === "POST") {
      const b = await this.body(req);
      const level: Scope | null = b?.level === "read" ? "paperclip:read" : b?.level === "control" ? "paperclip:control" : null;
      if (!level) return this.json(res, 400, { error: "level must be read or control" });
      return (await this.p.manageSetLevel(a, c[1], level)) ? this.json(res, 200, { ok: true }) : this.json(res, 404, { error: "No such connection" });
    }
    if (c && m === "DELETE") return (await this.p.manageRevoke(a, c[1])) ? this.json(res, 200, { ok: true }) : this.json(res, 404, { error: "No such connection" });

    // Paperclip plugin links. Only a browser session can mint a code; a plugin token can list links and unlink itself.
    if (m === "POST" && route === "/plugin-link") return this.json(res, 200, await this.p.manageIssueLinkCode(a));
    if (m === "GET" && route === "/plugin-links") return this.json(res, 200, { links: (await this.p.manageListPluginLinks(a.id)).map((l) => ({ ...l, current: l.id === linkId })) });
    const pl = /^\/plugin-links\/([A-Za-z0-9_-]{1,80})$/.exec(route);
    if (pl && m === "DELETE") {
      const id = pl[1] === "self" && linkId ? linkId : pl[1];
      if (bearer && id !== linkId) return this.json(res, 404, { error: "No such link" }); // a plugin token can only remove itself
      return (await this.p.manageRevokePluginLink(a, id)) ? this.json(res, 200, { ok: true }) : this.json(res, 404, { error: "No such link" });
    }

    if (m === "POST" && route === "/privacy") {
      const b = await this.body(req);
      if (!b || typeof b.anonymous !== "boolean") return this.json(res, 400, { error: "anonymous must be true or false" });
      try {
        const next = await this.p.manageSetPrivacy(a, b.anonymous);
        return this.json(res, 200, { anonymous: !!next.anonymous, alias: next.alias ?? null, name: displayName(next) });
      } catch {
        return this.json(res, 500, { error: "Could not update privacy" });
      }
    }

    // Sensitive actions: prove the secret key again.
    const sensitive = new Set(["/secret/rotate", "/paperclip/disconnect", "/account/delete"]);
    if (m === "POST" && sensitive.has(route)) {
      const b = await this.body(req);
      if (!b) return this.json(res, 400, { error: "Send JSON" });
      if (!(await this.p.manageReauth(a.id, String(b.secret ?? "")))) return this.json(res, 403, { error: "That secret key is not right (or too many attempts)." });
      if (route === "/secret/rotate") {
        const secret = await this.p.manageRotateSecret(a);
        const fresh = (await this.p.manageAccount(a.id))!;
        return this.json(res, 200, { secret }, { "Set-Cookie": this.cookie(fresh) });
      }
      if (route === "/paperclip/disconnect") {
        await this.p.manageDisconnectPaperclip(a);
        return this.json(res, 200, { ok: true });
      }
      if (String(b.confirm ?? "").toLowerCase() !== a.username.toLowerCase()) return this.json(res, 400, { error: "Type your username to confirm." });
      await this.p.manageDeleteAccount(a);
      return this.json(res, 200, { ok: true }, { "Set-Cookie": this.cookie(null) });
    }
    return this.json(res, 404, { error: "Not found" });
  }
}
