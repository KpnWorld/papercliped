import type { BridgeConfig, OAuthConfig } from "../config.js";

/**
 * Adapter for Paperclip's CLI-auth challenge flow (the same one `paperclipai auth login` uses):
 * create a challenge → the user approves it in Paperclip's own UI while signed in as a board user →
 * the pre-issued board API token becomes active. The bridge never sees the user's password.
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

type Fetch = typeof fetch;

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error ?? `Paperclip responded ${res.status}`);
  return body as T;
}

const sig = (config: BridgeConfig) => ({ signal: AbortSignal.timeout(config.timeoutMs) });

export class PaperclipLogin {
  constructor(
    private config: BridgeConfig,
    private oauth: OAuthConfig,
    private fetchImpl: Fetch = fetch,
  ) {}

  private origin() {
    return this.oauth.paperclipPublicUrl ?? new URL(this.config.apiUrl).origin;
  }

  async createChallenge(clientName: string): Promise<Challenge> {
    const res = await this.fetchImpl(`${this.config.apiUrl}/cli-auth/challenges`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ command: "paperclip-bridge oauth", clientName: clientName.slice(0, 120), requestedAccess: "board", requestedCompanyId: null }),
      ...sig(this.config),
    });
    const c = await json<{ id: string; token: string; boardApiToken: string; approvalPath: string; expiresAt: string }>(res);
    return {
      id: c.id,
      secret: c.token,
      boardApiToken: c.boardApiToken,
      approvalUrl: `${this.origin()}${c.approvalPath}`,
      expiresAt: Date.parse(c.expiresAt) || Date.now() + 10 * 60_000,
    };
  }

  async status(ch: Pick<Challenge, "id" | "secret">): Promise<"pending" | "approved" | "cancelled" | "expired"> {
    const url = `${this.config.apiUrl}/cli-auth/challenges/${encodeURIComponent(ch.id)}?token=${encodeURIComponent(ch.secret)}`;
    const r = await json<{ status: "pending" | "approved" | "cancelled" | "expired" }>(await this.fetchImpl(url, { headers: { Accept: "application/json" }, ...sig(this.config) }));
    return r.status;
  }

  /** Proves the token works and tells us whose it is. */
  async whoami(token: string): Promise<{ userId: string | null }> {
    const r = await json<{ userId?: string }>(
      await this.fetchImpl(`${this.config.apiUrl}/cli-auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, ...sig(this.config) }),
    );
    return { userId: r.userId ?? null };
  }

  /** Best effort: invalidate the board key we were issued when a grant is revoked. */
  async revoke(token: string): Promise<void> {
    try {
      await this.fetchImpl(`${this.config.apiUrl}/cli-auth/revoke-current`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
        ...sig(this.config),
      });
    } catch {
      /* the grant is already revoked on our side; Paperclip key expiry is the backstop */
    }
  }
}
