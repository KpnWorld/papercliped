/**
 * Adapter for Paperclip's CLI-auth challenge flow (the same one `paperclipai auth login` uses):
 * create a challenge → the user approves it in Paperclip's own UI while signed in as a board user →
 * the pre-issued board API token becomes active. The bridge never sees the user's password.
 *
 * In multi-tenant mode the Paperclip server is chosen by a stranger and may be hostile, so every field of
 * every response is validated before use, and requests go through the SSRF-safe fetch.
 */
export interface Challenge {
  id: string;
  /** Secret for polling this challenge. */
  secret: string;
  /** Board API token that becomes valid once the challenge is approved. */
  boardApiToken: string;
  approvalUrl: string;
  expiresAt: number;
}

export interface LoginTarget {
  /** e.g. https://paperclip.example.com/api */
  apiUrl: string;
  /** Origin the *user's browser* reaches Paperclip at (used for the approval link). */
  publicOrigin: string;
  fetch: typeof fetch;
  timeoutMs: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_PATH = /^\/cli-auth\/[0-9a-f-]{36}\?token=[A-Za-z0-9_\-.~%]{8,300}$/i;
/** Paperclip runs npm install server-side, which can take a while. */
const PLUGIN_INSTALL_TIMEOUT_MS = 120_000;
const TOKENISH = /^[\x21-\x7e]{8,600}$/; // printable ASCII, no whitespace

export class LoginError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function json(res: Response): Promise<any> {
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new LoginError(`Paperclip returned a non-JSON response (${res.status})`);
  }
  if (!res.ok) throw new LoginError(typeof body?.error === "string" ? body.error.slice(0, 200) : `Paperclip responded ${res.status}`, res.status);
  return body;
}

export class PaperclipLogin {
  constructor(private t: LoginTarget) {}

  private sig = () => ({ signal: AbortSignal.timeout(this.t.timeoutMs) });

  /** Is this a Paperclip we can sign in to? Returns a user-safe reason when not. */
  async probe(): Promise<{ ok: true } | { ok: false; reason: string }> {
    let body: any;
    try {
      body = await json(await this.t.fetch(`${this.t.apiUrl}/health`, { headers: { Accept: "application/json" }, ...this.sig() }));
    } catch (e) {
      return { ok: false, reason: `Could not reach a Paperclip instance there (${e instanceof LoginError ? e.message : "connection failed"}).` };
    }
    if (typeof body?.status !== "string" || typeof body?.deploymentMode !== "string") return { ok: false, reason: "That address did not respond like a Paperclip server." };
    if (body.deploymentMode === "local_trusted") return { ok: false, reason: "That Paperclip runs in local_trusted mode (no login), which cannot be used through a public service." };
    if (body.deploymentMode !== "authenticated") return { ok: false, reason: "Unsupported Paperclip deployment mode." };
    return { ok: true };
  }

  async createChallenge(clientName: string): Promise<Challenge> {
    const res = await this.t.fetch(`${this.t.apiUrl}/cli-auth/challenges`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ command: "paperclip-bridge oauth", clientName: clientName.slice(0, 120), requestedAccess: "board", requestedCompanyId: null }),
      ...this.sig(),
    });
    const c = await json(res);
    if (typeof c?.id !== "string" || !UUID.test(c.id)) throw new LoginError("Paperclip returned an invalid challenge id");
    if (typeof c.token !== "string" || !TOKENISH.test(c.token)) throw new LoginError("Paperclip returned an invalid challenge secret");
    if (typeof c.boardApiToken !== "string" || !TOKENISH.test(c.boardApiToken)) throw new LoginError("Paperclip returned an invalid credential");
    if (typeof c.approvalPath !== "string" || !APPROVAL_PATH.test(c.approvalPath)) throw new LoginError("Paperclip returned an unexpected approval link");
    const exp = Date.parse(c.expiresAt);
    return {
      id: c.id,
      secret: c.token,
      boardApiToken: c.boardApiToken,
      approvalUrl: `${this.t.publicOrigin}${c.approvalPath}`,
      // never trust a far-future expiry from the other side
      expiresAt: Number.isFinite(exp) ? Math.min(exp, Date.now() + 15 * 60_000) : Date.now() + 10 * 60_000,
    };
  }

  async status(ch: Pick<Challenge, "id" | "secret">): Promise<"pending" | "approved" | "cancelled" | "expired"> {
    const url = `${this.t.apiUrl}/cli-auth/challenges/${encodeURIComponent(ch.id)}?token=${encodeURIComponent(ch.secret)}`;
    const r = await json(await this.t.fetch(url, { headers: { Accept: "application/json" }, ...this.sig() }));
    return (["pending", "approved", "cancelled", "expired"] as const).find((s) => s === r?.status) ?? "pending";
  }

  /** Proves the token works and tells us whose it is. */
  async whoami(token: string): Promise<{ userId: string | null }> {
    const r = await json(await this.t.fetch(`${this.t.apiUrl}/cli-auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, ...this.sig() }));
    return { userId: typeof r?.userId === "string" ? r.userId.slice(0, 200) : null };
  }

  /**
   * The Papercliped plugin's state in this Paperclip: absent, or installed with its version.
   * `unsupported` = no plugin system there (older Paperclip) or the key may not manage plugins.
   */
  async pluginState(token: string, pluginKey: string): Promise<{ state: "absent" } | { state: "installed"; version: string | null } | { state: "unsupported" }> {
    const res = await this.t.fetch(`${this.t.apiUrl}/plugins`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, ...this.sig() });
    if (res.status === 403 || res.status === 404) return { state: "unsupported" };
    const list = await json(res);
    if (!Array.isArray(list)) throw new LoginError("Paperclip returned an unexpected plugin list");
    const hit = list.find((x) => x && typeof x === "object" && x.pluginKey === pluginKey);
    if (!hit) return { state: "absent" };
    return { state: "installed", version: typeof hit.version === "string" ? hit.version.slice(0, 40) : null };
  }

  /**
   * Install one fixed npm package at one exact version through Paperclip's own installer. Only an instance
   * admin's key is accepted there; anyone else gets a 403, reported as "denied". Nothing user-supplied reaches this call.
   */
  async installPlugin(token: string, packageName: string, version: string): Promise<"installed" | "denied" | "unsupported"> {
    const res = await this.t.fetch(`${this.t.apiUrl}/plugins/install`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ packageName, version }),
      signal: AbortSignal.timeout(Math.max(this.t.timeoutMs, PLUGIN_INSTALL_TIMEOUT_MS)),
    });
    if (res.status === 403) return "denied";
    if (res.status === 404) return "unsupported";
    const out = await json(res);
    if (out?.packageName !== packageName) throw new LoginError("Paperclip installed something other than the Papercliped plugin");
    return "installed";
  }

  /** Best effort: invalidate the board key we were issued when a grant is revoked. */
  async revoke(token: string): Promise<void> {
    try {
      await this.t.fetch(`${this.t.apiUrl}/cli-auth/revoke-current`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
        ...this.sig(),
      });
    } catch {
      /* the grant is already revoked on our side; Paperclip key expiry is the backstop */
    }
  }
}
