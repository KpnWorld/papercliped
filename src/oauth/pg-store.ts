import pg from "pg";
import type { CodeRecord, CodeTake, Grant, OAuthClient, PendingRecord, Store, TokenRecord } from "./store.js";

const MAX_CLIENTS = 1000;
const CLIENT_IDLE_MS = 7 * 24 * 3600 * 1000;
const TOUCH_PERSIST_MS = 5 * 60_000;
const CODE_REPLAY_WINDOW_MS = 5 * 60_000;

export interface PgOptions {
  connectionString: string;
  /** off: no TLS (local only) · require: encrypted, certificate not verified · verify: encrypted and verified (default). */
  ssl?: "off" | "require" | "verify";
  /** PEM of the CA to trust (Supabase: download "SSL certificate" from Database settings). */
  ca?: string;
  max?: number;
}

export function sslOption(o: Pick<PgOptions, "ssl" | "ca">): pg.PoolConfig["ssl"] {
  const mode = o.ssl ?? "verify";
  if (mode === "off") return false;
  if (mode === "require") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ...(o.ca ? { ca: o.ca } : {}) };
}

const num = (v: unknown) => Number(v);

const toGrant = (r: any): Grant => ({
  id: r.id,
  clientId: r.client_id,
  clientName: r.client_name,
  userId: r.user_id,
  scopes: r.scopes,
  resource: r.resource,
  instanceUrl: r.instance_url,
  sealedCredential: r.sealed_credential,
  createdAt: num(r.created_at),
  lastUsedAt: num(r.last_used_at),
  revoked: r.revoked,
});

/**
 * Postgres-backed Store (schema `bridge`, see migrations/001_init.sql). Safe to share between several bridge
 * processes: consuming a code or refresh token, and rate-limit counting, are single atomic statements.
 * Works through Supabase's transaction pooler (no prepared statements or session state are used).
 */
export class PgStore implements Store {
  private pool: pg.Pool;

  constructor(
    opts: PgOptions | pg.Pool,
    private now: () => number = Date.now,
  ) {
    this.pool =
      opts instanceof pg.Pool
        ? opts
        : new pg.Pool({ connectionString: opts.connectionString, ssl: sslOption(opts), max: opts.max ?? 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
    this.pool.on("error", (e) => console.error("postgres pool error:", e.message));
  }

  private q = (text: string, params: unknown[] = []) => this.pool.query(text, params);

  async putClient(c: OAuthClient) {
    await this.q(
      `insert into bridge.clients (id, name, redirect_uris, created_at, last_used_at) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set name = excluded.name, redirect_uris = excluded.redirect_uris, last_used_at = excluded.last_used_at`,
      [c.id, c.name, c.redirectUris, c.createdAt, c.lastUsedAt],
    );
    await this.pruneClients();
  }
  async getClient(id: string) {
    const r = await this.q("select * from bridge.clients where id = $1", [id]);
    const x = r.rows[0];
    return x ? { id: x.id, name: x.name, redirectUris: x.redirect_uris, createdAt: num(x.created_at), lastUsedAt: num(x.last_used_at) } : undefined;
  }
  async touchClient(id: string) {
    await this.q("update bridge.clients set last_used_at = $2 where id = $1", [id, this.now()]);
  }
  private async pruneClients() {
    const t = this.now();
    // Disposable = no live grant. Drop idle ones, then oldest-first beyond the cap.
    await this.q(
      `delete from bridge.clients c where not exists (select 1 from bridge.grants g where g.client_id = c.id and not g.revoked)
         and (c.last_used_at < $1 or c.id in (
               select id from bridge.clients o where not exists (select 1 from bridge.grants g where g.client_id = o.id and not g.revoked)
               order by last_used_at desc offset $2))`,
      [t - CLIENT_IDLE_MS, MAX_CLIENTS],
    );
  }

  async putGrant(g: Grant) {
    await this.q(
      `insert into bridge.grants (id, client_id, client_name, user_id, scopes, resource, instance_url, sealed_credential, created_at, last_used_at, revoked)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do update set sealed_credential = excluded.sealed_credential, scopes = excluded.scopes, revoked = excluded.revoked, last_used_at = excluded.last_used_at`,
      [g.id, g.clientId, g.clientName, g.userId, g.scopes, g.resource, g.instanceUrl, g.sealedCredential, g.createdAt, g.lastUsedAt, g.revoked],
    );
  }
  async getGrant(id: string) {
    const r = await this.q("select * from bridge.grants where id = $1", [id]);
    return r.rows[0] ? toGrant(r.rows[0]) : undefined;
  }
  async touchGrant(id: string) {
    const t = this.now();
    await this.q("update bridge.grants set last_used_at = $2 where id = $1 and last_used_at < $3", [id, t, t - TOUCH_PERSIST_MS]);
  }
  async revokeGrant(id: string) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const old = await c.query("select sealed_credential from bridge.grants where id = $1 for update", [id]);
      await c.query("update bridge.grants set revoked = true, sealed_credential = null where id = $1", [id]);
      await c.query("delete from bridge.tokens where grant_id = $1", [id]);
      await c.query("commit");
      return (old.rows[0]?.sealed_credential as string | null) ?? null;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  async listGrants() {
    return (await this.q("select * from bridge.grants order by created_at")).rows.map(toGrant);
  }
  async listIdleGrants(cutoff: number) {
    return (await this.q("select * from bridge.grants where not revoked and last_used_at < $1", [cutoff])).rows.map(toGrant);
  }

  private async putToken(kind: "access" | "refresh", hash: string, r: TokenRecord) {
    await this.q("insert into bridge.tokens (hash, kind, grant_id, expires_at, consumed) values ($1,$2,$3,$4,false)", [hash, kind, r.grantId, r.expiresAt]);
  }
  private async getToken(kind: "access" | "refresh", hash: string): Promise<TokenRecord | undefined> {
    const r = await this.q("select grant_id, expires_at, consumed from bridge.tokens where hash = $1 and kind = $2 and expires_at > $3", [hash, kind, this.now()]);
    const x = r.rows[0];
    return x ? { grantId: x.grant_id, expiresAt: num(x.expires_at), consumed: x.consumed } : undefined;
  }
  putAccess = (hash: string, r: TokenRecord) => this.putToken("access", hash, r);
  getAccess = (hash: string) => this.getToken("access", hash);
  putRefresh = (hash: string, r: TokenRecord) => this.putToken("refresh", hash, r);
  getRefresh = (hash: string) => this.getToken("refresh", hash);
  async consumeRefresh(hash: string) {
    const r = await this.q("update bridge.tokens set consumed = true where hash = $1 and kind = 'refresh' and not consumed returning hash", [hash]);
    return r.rowCount === 1;
  }
  async findAnyToken(hash: string) {
    const r = await this.q("select grant_id, expires_at, consumed from bridge.tokens where hash = $1", [hash]);
    const x = r.rows[0];
    return x ? { grantId: x.grant_id, expiresAt: num(x.expires_at), consumed: x.consumed } : undefined;
  }

  async putPending(rid: string, p: PendingRecord) {
    await this.q("insert into bridge.pending (rid, data, expires_at) values ($1,$2,$3) on conflict (rid) do update set data = excluded.data, expires_at = excluded.expires_at", [rid, JSON.stringify(p), p.expiresAt]);
  }
  async getPending(rid: string) {
    const r = await this.q("select data from bridge.pending where rid = $1 and expires_at > $2", [rid, this.now()]);
    return r.rows[0]?.data as PendingRecord | undefined;
  }
  async deletePending(rid: string) {
    await this.q("delete from bridge.pending where rid = $1", [rid]);
  }
  async countPending() {
    return num((await this.q("select count(*) as n from bridge.pending where expires_at > $1", [this.now()])).rows[0].n);
  }

  async putCode(hash: string, c: CodeRecord) {
    await this.q("insert into bridge.codes (hash, data, expires_at) values ($1,$2,$3)", [hash, JSON.stringify(c), c.expiresAt]);
  }
  async takeCode(hash: string): Promise<CodeTake> {
    // Atomic single-use, and scrub the sealed credential from the row as it is consumed.
    const taken = await this.q(
      `with old as (select hash, data from bridge.codes where hash = $1 and not used and expires_at > $2 for update)
       update bridge.codes c set used = true, data = c.data - 'sealedCredential' from old where c.hash = old.hash returning old.data`,
      [hash, this.now()],
    );
    if (taken.rows[0]) return { status: "ok", record: taken.rows[0].data as CodeRecord };
    const prior = await this.q("select used, grant_id from bridge.codes where hash = $1", [hash]);
    if (prior.rows[0]?.used) return { status: "replay", grantId: prior.rows[0].grant_id ?? undefined };
    return { status: "missing" };
  }
  async setCodeGrant(hash: string, grantId: string) {
    await this.q("update bridge.codes set grant_id = $2 where hash = $1", [hash, grantId]);
  }

  async hit(key: string, limit: number, windowMs: number) {
    const t = this.now();
    const r = await this.q(
      `insert into bridge.rate_limits (key, n, reset_at) values ($1, 1, $2)
       on conflict (key) do update set
         n = case when bridge.rate_limits.reset_at <= $3 then 1 else bridge.rate_limits.n + 1 end,
         reset_at = case when bridge.rate_limits.reset_at <= $3 then $2 else bridge.rate_limits.reset_at end
       returning n`,
      [key, t + windowMs, t],
    );
    return num(r.rows[0].n) <= limit;
  }

  async prune() {
    const t = this.now();
    await this.q("delete from bridge.tokens where expires_at <= $1", [t]);
    await this.q("delete from bridge.pending where expires_at <= $1", [t]);
    await this.q("delete from bridge.codes where expires_at <= $1", [t - CODE_REPLAY_WINDOW_MS]);
    await this.q("delete from bridge.rate_limits where reset_at <= $1", [t]);
    await this.pruneClients();
  }

  async ping() {
    await this.q("select 1");
  }
  async close() {
    await this.pool.end();
  }
}
