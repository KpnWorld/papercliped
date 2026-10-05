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
  /** AES-GCM sealed Paperclip credential (null when Paperclip needs none). */
  sealedCredential: string | null;
  createdAt: number;
  lastUsedAt: number;
  revoked: boolean;
}

export interface TokenRecord {
  grantId: string;
  expiresAt: number;
  /** Refresh tokens only: set once exchanged, so replay can be detected. */
  consumed?: boolean;
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

/**
 * Clients, grants and token hashes live here (and are persisted when `file` is set).
 * Raw tokens are never stored — only SHA-256 hashes. Short-lived auth codes and
 * in-flight consent requests are kept in memory by the provider, not here.
 */
export class OAuthStore {
  private d: Persisted = { version: 1, clients: {}, grants: {}, access: {}, refresh: {} };

  constructor(
    private file: string | null = null,
    private now: () => number = Date.now,
  ) {
    if (file && existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Persisted;
      if (parsed?.version === 1) this.d = parsed;
    }
  }

  private save() {
    this.prune();
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.d), { mode: 0o600 });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }

  private prune() {
    const t = this.now();
    for (const m of [this.d.access, this.d.refresh]) for (const [h, r] of Object.entries(m)) if (r.expiresAt <= t) delete m[h];
    const inUse = new Set(Object.values(this.d.grants).filter((g) => !g.revoked).map((g) => g.clientId));
    // Clients that never produced a live grant are disposable: drop idle ones, then oldest-first past the cap.
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
  }

  // clients
  putClient(c: OAuthClient) {
    this.d.clients[c.id] = c;
    this.save();
  }
  getClient = (id: string) => this.d.clients[id];
  touchClient(id: string) {
    const c = this.d.clients[id];
    if (c) c.lastUsedAt = this.now();
  }

  // grants
  putGrant(g: Grant) {
    this.d.grants[g.id] = g;
    this.save();
  }
  getGrant = (id: string) => this.d.grants[id];
  touchGrant(id: string) {
    const g = this.d.grants[id];
    if (g) g.lastUsedAt = this.now(); // memory only; persisted on the next real write
  }
  revokeGrant(id: string) {
    const g = this.d.grants[id];
    if (!g) return;
    g.revoked = true;
    g.sealedCredential = null; // drop the Paperclip credential as soon as access is revoked
    for (const m of [this.d.access, this.d.refresh]) for (const [h, r] of Object.entries(m)) if (r.grantId === id) delete m[h];
    this.save();
  }
  listGrants = () => Object.values(this.d.grants);

  // tokens (keyed by sha256 hex of the raw token)
  putAccess(hash: string, r: TokenRecord) {
    this.d.access[hash] = r;
    this.save();
  }
  getAccess(hash: string) {
    const r = this.d.access[hash];
    return r && r.expiresAt > this.now() ? r : undefined;
  }
  putRefresh(hash: string, r: TokenRecord) {
    this.d.refresh[hash] = r;
    this.save();
  }
  getRefresh(hash: string) {
    const r = this.d.refresh[hash];
    return r && r.expiresAt > this.now() ? r : undefined;
  }
  consumeRefresh(hash: string) {
    const r = this.d.refresh[hash];
    if (r) r.consumed = true;
    this.save();
  }
  /** Look a presented token up as either kind (used by /revoke). */
  findAnyToken(hash: string): TokenRecord | undefined {
    return this.d.access[hash] ?? this.d.refresh[hash];
  }
}
