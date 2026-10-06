import { BridgeClient, BridgeError, normalizeBridgeUrl } from "./bridge.js";
import { isStoredLink, linkScope, type StoredLink } from "./keys.js";

export interface Actor {
  type: string;
  userId: string | null;
}
export interface StateLike {
  get(k: ReturnType<typeof linkScope>): Promise<unknown>;
  set(k: ReturnType<typeof linkScope>, v: unknown): Promise<void>;
  delete(k: ReturnType<typeof linkScope>): Promise<void>;
}
export interface Deps {
  state: StateLike;
  bridgeUrl: () => Promise<unknown>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  allowInsecureLoopback?: boolean; // tests only
}

/** The user this call is for. Comes from the host's verified actor, never from params. */
function who(actor: Actor): string {
  if (actor.type !== "user" || !actor.userId) throw new Error("Sign in to Paperclip as a person to use Papercliped.");
  return actor.userId;
}

/**
 * Every action the page can call. Responses never contain the bridge token: it is read from plugin state, used on the server
 * side of the bridge call, and goes no further.
 */
export function createHandlers(d: Deps) {
  const client = async () => new BridgeClient(normalizeBridgeUrl(await d.bridgeUrl(), { allowInsecureLoopback: d.allowInsecureLoopback }), d.fetch);
  const load = async (userId: string): Promise<StoredLink | null> => {
    const v = await d.state.get(linkScope(userId));
    return isStoredLink(v) ? v : null;
  };
  /** Run a bridge call with this user's token; a 401 means the link is gone, so forget it. */
  async function authed<T>(userId: string, run: (c: BridgeClient, token: string) => Promise<T>): Promise<T> {
    const link = await load(userId);
    if (!link) throw new BridgeError("Link your Papercliped account first.", 401);
    try {
      return await run(await client(), link.token);
    } catch (e) {
      if (e instanceof BridgeError && e.unauthorized) await d.state.delete(linkScope(userId));
      throw e;
    }
  }

  return {
    async status(_p: Record<string, unknown>, actor: Actor) {
      const userId = who(actor);
      if (!(await load(userId))) return { linked: false as const };
      try {
        const me = await authed(userId, (c, t) => c.me(t));
        return { linked: true as const, me };
      } catch (e) {
        if (e instanceof BridgeError && e.unauthorized) return { linked: false as const, expired: true };
        throw e;
      }
    },

    async link(p: Record<string, unknown>, actor: Actor) {
      const userId = who(actor);
      const code = typeof p.code === "string" ? p.code.trim().slice(0, 40) : "";
      if (!code) throw new Error("Paste the code from your Papercliped /manage page.");
      const host = typeof p.instanceHost === "string" ? p.instanceHost.slice(0, 255) : null;
      const token = await (await client()).exchange(code, { instanceHost: host, paperclipUserId: userId });
      await d.state.set(linkScope(userId), { token, linkedAt: Date.now() } satisfies StoredLink);
      const me = await authed(userId, (c, t) => c.me(t));
      return { linked: true as const, me };
    },

    async connections(_p: Record<string, unknown>, actor: Actor) {
      return { connections: await authed(who(actor), (c, t) => c.connections(t)) };
    },

    async setLevel(p: Record<string, unknown>, actor: Actor) {
      if (p.level !== "read" && p.level !== "control") throw new Error("level must be read or control");
      if (typeof p.id !== "string" || !p.id) throw new Error("Missing connection id");
      const id = p.id, level = p.level;
      await authed(who(actor), (c, t) => c.setLevel(t, id, level));
      return { ok: true };
    },

    async disconnect(p: Record<string, unknown>, actor: Actor) {
      if (typeof p.id !== "string" || !p.id) throw new Error("Missing connection id");
      const id = p.id;
      await authed(who(actor), (c, t) => c.disconnect(t, id));
      return { ok: true };
    },

    async privacy(p: Record<string, unknown>, actor: Actor) {
      if (typeof p.anonymous !== "boolean") throw new Error("anonymous must be true or false");
      const anonymous = p.anonymous;
      return authed(who(actor), (c, t) => c.setPrivacy(t, anonymous));
    },

    /** The Papercliped service's public status (aggregate numbers only; no account or link needed). */
    async serviceStatus(_p: Record<string, unknown>, _actor: Actor) {
      return (await client()).serviceStatus();
    },

    /** Forget the token here, and ask the bridge to revoke it. Local forgetting happens even if the bridge cannot be reached. */
    async unlink(_p: Record<string, unknown>, actor: Actor) {
      const userId = who(actor);
      const link = await load(userId);
      let revoked = false;
      if (link) {
        try {
          await (await client()).unlink(link.token);
          revoked = true;
        } catch (e) {
          revoked = e instanceof BridgeError && e.unauthorized; // already invalid there
        }
      }
      await d.state.delete(linkScope(userId));
      return { linked: false as const, revoked };
    },
  };
}
