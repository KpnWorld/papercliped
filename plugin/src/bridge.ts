/** Pure client for the Papercliped bridge's manage API. No Paperclip SDK imports, so it is easy to test against a fake bridge. */

export const DEFAULT_BRIDGE_URL = "https://papercliped.kpnsolute.com";

export class BridgeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BridgeError";
  }
  /** The token is unknown, expired or revoked: the user has to link again. */
  get unauthorized() {
    return this.status === 401;
  }
}

export interface Connection {
  id: string;
  app: string;
  level: "paperclip:read" | "paperclip:control" | "paperclip:admin";
  createdAt: number;
  lastUsedAt: number | null;
}
export interface Me {
  name: string;
  anonymous: boolean;
  alias: string | null;
  beta: boolean;
  paperclip: string | null;
  connected: boolean;
}

/**
 * The bridge URL must be https (the token and the one-time code travel to it). `allowInsecureLoopback` exists for tests only and
 * the worker never sets it.
 */
export function normalizeBridgeUrl(raw: unknown, opts: { allowInsecureLoopback?: boolean } = {}): string {
  const text = typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_BRIDGE_URL;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw new Error("The Papercliped bridge URL is not a valid URL.");
  }
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  if (u.protocol !== "https:" && !(opts.allowInsecureLoopback && u.protocol === "http:" && loopback)) throw new Error("The Papercliped bridge URL must use https.");
  if (u.username || u.password) throw new Error("The Papercliped bridge URL must not contain credentials.");
  if (u.search || u.hash) throw new Error("The Papercliped bridge URL must not contain a query or fragment.");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const MAX_BODY = 1_000_000;

export class BridgeClient {
  constructor(private base: string, private doFetch: FetchLike, private timeoutMs = 10_000) {}

  private async req<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json", "x-papercliped": "1" };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await this.doFetch(`${this.base}/api/manage${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), redirect: "error", signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new BridgeError("Could not reach the Papercliped bridge.", 0);
    }
    const text = (await res.text()).slice(0, MAX_BODY);
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) throw new BridgeError(typeof json?.error === "string" ? json.error.slice(0, 200) : `The bridge answered ${res.status}.`, res.status);
    return json as T;
  }

  async exchange(code: string, meta: { instanceHost?: string | null; paperclipUserId?: string | null }): Promise<string> {
    const r = await this.req<{ token?: string }>("POST", "/plugin-link/exchange", { body: { code, instanceHost: meta.instanceHost ?? null, paperclipUserId: meta.paperclipUserId ?? null } });
    if (typeof r.token !== "string" || !r.token.startsWith("pcb_pl_")) throw new BridgeError("The bridge sent an unexpected answer.", 502);
    return r.token;
  }
  me(token: string) {
    return this.req<Me>("GET", "/me", { token });
  }
  async connections(token: string): Promise<Connection[]> {
    return (await this.req<{ connections: Connection[] }>("GET", "/connections", { token })).connections ?? [];
  }
  async setLevel(token: string, id: string, level: "read" | "control"): Promise<void> {
    await this.req("POST", `/connections/${encodeURIComponent(id)}`, { token, body: { level } });
  }
  async disconnect(token: string, id: string): Promise<void> {
    await this.req("DELETE", `/connections/${encodeURIComponent(id)}`, { token });
  }
  setPrivacy(token: string, anonymous: boolean) {
    return this.req<{ anonymous: boolean; alias: string | null; name: string }>("POST", "/privacy", { token, body: { anonymous } });
  }
  async unlink(token: string): Promise<void> {
    await this.req("DELETE", "/plugin-links/self", { token });
  }
}
