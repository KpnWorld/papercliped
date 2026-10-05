import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { HIST_EDGES, isFault, type AuditRow, type AuditStore, type BreakdownRow, type SeriesBucket, type Totals } from "../telemetry/types.js";

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
export interface Store extends AuditStore {
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

/** Linear-interpolated percentile (same definition as Postgres percentile_cont). `sorted` must be ascending. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);
const bridgeMs = (r: AuditRow) => r.totalMs - (r.upstreamMs ?? 0);
const MAX_AUDIT_ROWS = 20_000;

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

  // ── audit (bounded ring; history is lost on restart — use Postgres for real retention) ──
  private audit: AuditRow[] = [];
  private auditSeq = 0;

  async insertAudit(rows: AuditRow[]) {
    for (const r of rows) this.audit.push({ ...r, id: ++this.auditSeq });
    if (this.audit.length > MAX_AUDIT_ROWS) this.audit.splice(0, this.audit.length - MAX_AUDIT_ROWS);
  }
  private window(kind: string, from: number, to: number) {
    return this.audit.filter((r) => r.kind === kind && r.at >= from && r.at < to);
  }
  private summarize(rows: AuditRow[]) {
    const tot = asc(rows.map((r) => r.totalMs));
    const up = asc(rows.filter((r) => (r.upstreamCalls ?? 0) > 0).map((r) => r.upstreamMs ?? 0));
    return {
      count: rows.length,
      errors: rows.filter((r) => !r.ok).length,
      faults: rows.filter((r) => isFault(r.errorClass)).length,
      p50: percentile(tot, 0.5),
      p95: percentile(tot, 0.95),
      p99: percentile(tot, 0.99),
      upstreamP95: percentile(up, 0.95),
      bridgeP95: percentile(asc(rows.map(bridgeMs)), 0.95),
    };
  }
  async auditSeries(kind: "tool" | "http", from: number, to: number, bucketMs: number): Promise<SeriesBucket[]> {
    const groups = new Map<number, AuditRow[]>();
    for (const r of this.window(kind, from, to)) {
      const t = Math.floor(r.at / bucketMs) * bucketMs;
      (groups.get(t) ?? groups.set(t, []).get(t)!).push(r);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, rows]) => {
        const s = this.summarize(rows);
        return {
          t,
          count: s.count,
          errors: s.errors,
          faults: s.faults,
          p50: s.p50,
          p95: s.p95,
          p99: s.p99,
          avgUpstream: rows.reduce((a, r) => a + (r.upstreamMs ?? 0), 0) / rows.length,
          avgBridge: rows.reduce((a, r) => a + bridgeMs(r), 0) / rows.length,
        };
      });
  }
  async auditTotals(kind: "tool" | "http", from: number, to: number): Promise<Totals> {
    const rows = this.window(kind, from, to);
    const s = this.summarize(rows);
    return { count: s.count, errors: s.errors, faults: s.faults, mutations: rows.filter((r) => r.mutation).length, p50: s.p50, p95: s.p95, p99: s.p99, upstreamP95: s.upstreamP95, bridgeP95: s.bridgeP95 };
  }
  async auditBreakdown(kind: "tool" | "http", by: "name" | "instance" | "errorClass", from: number, to: number, limit: number): Promise<BreakdownRow[]> {
    const groups = new Map<string, AuditRow[]>();
    for (const r of this.window(kind, from, to)) {
      const key = by === "name" ? r.name : by === "instance" ? r.instance : r.ok ? null : r.errorClass;
      if (key) (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
    }
    return [...groups.entries()]
      .map(([key, rows]) => {
        const s = this.summarize(rows);
        return { key, count: s.count, errors: s.errors, faults: s.faults, p50: s.p50, p95: s.p95, upstreamP95: s.upstreamP95 };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
  async auditHistogram(kind: "tool" | "http", from: number, to: number): Promise<number[]> {
    const out = new Array(HIST_EDGES.length + 1).fill(0);
    for (const r of this.window(kind, from, to)) out[HIST_EDGES.filter((e) => r.totalMs >= e).length] += 1;
    return out;
  }
  async auditSlowest(kind: "tool" | "http", from: number, to: number, limit: number) {
    return this.window(kind, from, to).sort((a, b) => b.totalMs - a.totalMs).slice(0, limit);
  }
  async auditRecent(afterId: number, limit: number, kind?: "tool" | "http") {
    return this.audit.filter((r) => (r.id ?? 0) > afterId && (!kind || r.kind === kind)).slice(-limit).reverse();
  }
  async pruneAudit(beforeMs: number) {
    const n = this.audit.length;
    this.audit = this.audit.filter((r) => r.at >= beforeMs);
    return n - this.audit.length;
  }

  async prune() {
    this.save();
  }
  async ping() {}
  async close() {}
}

/** Back-compat name used by older call sites/tests. */
export { MemoryStore as OAuthStore };
