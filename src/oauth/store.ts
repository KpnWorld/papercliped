import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
  createdAt: number;
  lastUsedAt: number;
}

export interface Grant {
  id: string;
  clientId: string;
  clientName: string;
  userId: string | null;
  scopes: string[];
  resource: string;
  /** Origin of the user's Paperclip instance (multi-tenant mode); null in single-instance mode. */
  instanceUrl: string | null;
  /** Sealed Paperclip credential (null when Paperclip needs none, or after revocation). */
  sealedCredential: string | null;
  createdAt: number;
  lastUsedAt: number;
  revoked: boolean;
}

export interface TokenRecord {
  grantId: string;
  expiresAt: number;
  consumed?: boolean;
}

/** In-flight consent request. Anything sensitive is already sealed by the provider; the store treats it as opaque. */
export interface PendingRecord {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  requestedMax: string;
  csrf: string;
  /** Multi-tenant: the Paperclip origin chosen on the instance step. */
  instanceUrl?: string;
  /** Sealed JSON of the Paperclip login challenge (contains the pending board token). */
  sealedChallenge?: string;
  /** Instance-step attempts, to bound probing through the bridge. */
  attempts: number;
  expiresAt: number;
}

export interface CodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  clientName: string;
  userId: string | null;
  instanceUrl: string | null;
  sealedCredential: string | null;
  expiresAt: number;
}

export type CodeTake = { status: "ok"; record: CodeRecord } | { status: "replay"; grantId?: string } | { status: "missing" };

/**
 * Persistence boundary. Implementations must be safe to share between processes (the Postgres one is);
 * the in-memory/JSON one is single-process. Raw tokens are never stored — only SHA-256 hashes.
 */
export interface Store {
  putClient(c: OAuthClient): Promise<void>;
  getClient(id: string): Promise<OAuthClient | undefined>;
  touchClient(id: string): Promise<void>;

  putGrant(g: Grant): Promise<void>;
  getGrant(id: string): Promise<Grant | undefined>;
  touchGrant(id: string): Promise<void>;
  /** Mark revoked, drop the sealed credential and every token of the grant. Returns the credential that was dropped. */
  revokeGrant(id: string): Promise<string | null>;
  listGrants(): Promise<Grant[]>;
  /** Live grants not used since `cutoff` (ms epoch). */
  listIdleGrants(cutoff: number): Promise<Grant[]>;

  putAccess(hash: string, r: TokenRecord): Promise<void>;
  getAccess(hash: string): Promise<TokenRecord | undefined>;
  putRefresh(hash: string, r: TokenRecord): Promise<void>;
  getRefresh(hash: string): Promise<TokenRecord | undefined>;
  /** Atomically mark a refresh token used. False if it was already used (concurrent or replayed). */
  consumeRefresh(hash: string): Promise<boolean>;
  findAnyToken(hash: string): Promise<TokenRecord | undefined>;

  putPending(rid: string, p: PendingRecord): Promise<void>;
  getPending(rid: string): Promise<PendingRecord | undefined>;
  deletePending(rid: string): Promise<void>;
  countPending(): Promise<number>;

  putCode(hash: string, c: CodeRecord): Promise<void>;
  /** Atomically consume a code; a second take reports `replay`. */
  takeCode(hash: string): Promise<CodeTake>;
  setCodeGrant(hash: string, grantId: string): Promise<void>;

  /** Fixed-window counter shared across processes. True if the call is within `limit`. */
  hit(key: string, limit: number, windowMs: number): Promise<boolean>;

  /** Delete expired rows. */
  prune(): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

interface Persisted {
  version: 1;
  clients: Record<string, OAuthClient>;
  grants: Record<string, Grant>;
  access: Record<string, TokenRecord>;
  refresh: Record<string, TokenRecord>;
}

const MAX_CLIENTS = 1000;
const CLIENT_IDLE_MS = 7 * 24 * 3600 * 1000;
const TOUCH_PERSIST_MS = 5 * 60_000;
const CODE_REPLAY_WINDOW_MS = 5 * 60_000;

/** Memory store; with `file` it persists clients/grants/tokens as JSON (0600, atomic rename). Single process only. */
export class MemoryStore implements Store {
  private d: Persisted = { version: 1, clients: {}, grants: {}, access: {}, refresh: {} };
  private pending = new Map<string, PendingRecord>();
  private codes = new Map<string, { rec: CodeRecord; used: boolean; grantId?: string }>();
  private rates = new Map<string, { n: number; resetAt: number }>();
  private lastPersist = new Map<string, number>();

  constructor(
    private file: string | null = null,
    private now: () => number = Date.now,
  ) {
    if (file && existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Persisted;
      if (parsed?.version === 1) {
        this.d = parsed;
        for (const g of Object.values(this.d.grants)) g.instanceUrl ??= null;
      }
    }
  }

  private save() {
    this.pruneSync();
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.d), { mode: 0o600 });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }

  private pruneSync() {
    const t = this.now();
    for (const m of [this.d.access, this.d.refresh]) for (const [h, r] of Object.entries(m)) if (r.expiresAt <= t) delete m[h];
    const inUse = new Set(Object.values(this.d.grants).filter((g) => !g.revoked).map((g) => g.clientId));
    const disposable = Object.values(this.d.clients)
      .filter((c) => !inUse.has(c.id))
      .sort((x, y) => x.lastUsedAt - y.lastUsedAt);
    let total = Object.keys(this.d.clients).length;
    for (const c of disposable) {
      if (t - c.lastUsedAt > CLIENT_IDLE_MS || total > MAX_CLIENTS) {
        delete this.d.clients[c.id];
        total -= 1;
      }
    }
    for (const [k, v] of this.pending) if (v.expiresAt <= t) this.pending.delete(k);
    for (const [k, v] of this.codes) if (v.rec.expiresAt + CODE_REPLAY_WINDOW_MS <= t) this.codes.delete(k);
    for (const [k, v] of this.rates) if (v.resetAt <= t) this.rates.delete(k);
  }

  async putClient(c: OAuthClient) {
    this.d.clients[c.id] = c;
    this.save();
  }
  async getClient(id: string) {
    return this.d.clients[id];
  }
  async touchClient(id: string) {
    const c = this.d.clients[id];
    if (c) c.lastUsedAt = this.now();
  }

  async putGrant(g: Grant) {
    this.d.grants[g.id] = g;
    this.lastPersist.set(g.id, this.now());
    this.save();
  }
  async getGrant(id: string) {
    return this.d.grants[id];
  }
  async touchGrant(id: string) {
    const g = this.d.grants[id];
    if (!g) return;
    g.lastUsedAt = this.now();
    if (this.now() - (this.lastPersist.get(id) ?? 0) > TOUCH_PERSIST_MS) {
      this.lastPersist.set(id, this.now());
      this.save();
    }
  }
  async revokeGrant(id: string) {
    const g = this.d.grants[id];
    if (!g) return null;
    const dropped = g.sealedCredential;
    g.revoked = true;
    g.sealedCredential = null;
    for (const m of [this.d.access, this.d.refresh]) for (const [h, r] of Object.entries(m)) if (r.grantId === id) delete m[h];
    this.save();
    return dropped;
  }
  async listGrants() {
    return Object.values(this.d.grants);
  }
  async listIdleGrants(cutoff: number) {
    return Object.values(this.d.grants).filter((g) => !g.revoked && g.lastUsedAt < cutoff);
  }

  async putAccess(hash: string, r: TokenRecord) {
    this.d.access[hash] = r;
    this.save();
  }
  async getAccess(hash: string) {
    const r = this.d.access[hash];
    return r && r.expiresAt > this.now() ? r : undefined;
  }
  async putRefresh(hash: string, r: TokenRecord) {
    this.d.refresh[hash] = r;
    this.save();
  }
  async getRefresh(hash: string) {
    const r = this.d.refresh[hash];
    return r && r.expiresAt > this.now() ? r : undefined;
  }
  async consumeRefresh(hash: string) {
    const r = this.d.refresh[hash];
    if (!r || r.consumed) return false;
    r.consumed = true;
    this.save();
    return true;
  }
  async findAnyToken(hash: string) {
    return this.d.access[hash] ?? this.d.refresh[hash];
  }

  async putPending(rid: string, p: PendingRecord) {
    this.pending.set(rid, p);
  }
  async getPending(rid: string) {
    const p = this.pending.get(rid);
    return p && p.expiresAt > this.now() ? p : undefined;
  }
  async deletePending(rid: string) {
    this.pending.delete(rid);
  }
  async countPending() {
    return this.pending.size;
  }

  async putCode(hash: string, rec: CodeRecord) {
    this.codes.set(hash, { rec, used: false });
  }
  async takeCode(hash: string): Promise<CodeTake> {
    const e = this.codes.get(hash);
    if (!e) return { status: "missing" };
    if (e.used) return { status: "replay", grantId: e.grantId };
    if (e.rec.expiresAt <= this.now()) return { status: "missing" };
    e.used = true;
    const record = e.rec;
    e.rec = { ...record, sealedCredential: null }; // scrub as it is consumed
    return { status: "ok", record };
  }
  async setCodeGrant(hash: string, grantId: string) {
    const e = this.codes.get(hash);
    if (e) e.grantId = grantId;
  }

  async hit(key: string, limit: number, windowMs: number) {
    const t = this.now();
    const cur = this.rates.get(key);
    if (!cur || cur.resetAt <= t) {
      this.rates.set(key, { n: 1, resetAt: t + windowMs });
      return true;
    }
    cur.n += 1;
    return cur.n <= limit;
  }

  async prune() {
    this.save();
  }
  async ping() {}
  async close() {}
}

/** Back-compat name used by older call sites/tests. */
export { MemoryStore as OAuthStore };
