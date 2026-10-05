import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consolidatedSql, migrate } from "../src/migrate.js";
import { PgStore, sslOption } from "../src/oauth/pg-store.js";
import { HIST_EDGES, type AuditRow } from "../src/telemetry/types.js";
import { MemoryStore, type CodeRecord, type Grant, type PendingRecord, type Store } from "../src/oauth/store.js";

const DB = process.env.TEST_DATABASE_URL;
const clock = { t: 1_800_000_000_000 };
const now = () => clock.t;

const grant = (id: string, over: Partial<Grant> = {}): Grant => ({
  id, clientId: "c1", clientName: "Claude", userId: "u1", scopes: ["paperclip:read"], resource: "https://b/mcp",
  instanceUrl: "https://p.example.com", sealedCredential: "kid.sealed", createdAt: clock.t, lastUsedAt: clock.t, revoked: false, ...over,
});
const code = (over: Partial<CodeRecord> = {}): CodeRecord => ({
  clientId: "c1", redirectUri: "https://claude.ai/cb", codeChallenge: "x".repeat(43), scopes: ["paperclip:read"], clientName: "Claude",
  userId: "u1", instanceUrl: "https://p.example.com", sealedCredential: "kid.sealed", expiresAt: clock.t + 60_000, ...over,
});
const pending = (over: Partial<PendingRecord> = {}): PendingRecord => ({
  clientId: "c1", clientName: "Claude", redirectUri: "https://claude.ai/cb", state: "s", codeChallenge: "x".repeat(43), requestedMax: "paperclip:read",
  csrf: "csrf", attempts: 0, expiresAt: clock.t + 600_000, ...over,
});

function contract(name: string, make: () => Promise<Store>) {
  describe(`Store contract: ${name}`, () => {
    let s: Store;
    beforeAll(async () => {
      s = await make();
    });
    afterAll(async () => s.close());

    it("clients round-trip", async () => {
      await s.putClient({ id: "c1", name: "Claude", redirectUris: ["https://claude.ai/cb", "http://localhost/cb"], createdAt: clock.t, lastUsedAt: clock.t });
      expect(await s.getClient("c1")).toMatchObject({ name: "Claude", redirectUris: ["https://claude.ai/cb", "http://localhost/cb"] });
      expect(await s.getClient("nope")).toBeUndefined();
    });

    it("grants round-trip, including the tenant instance", async () => {
      await s.putGrant(grant("g1"));
      expect(await s.getGrant("g1")).toEqual(grant("g1"));
      expect((await s.listGrants()).map((g) => g.id)).toContain("g1");
    });

    it("revokeGrant drops the credential and every token, and returns what it dropped", async () => {
      await s.putGrant(grant("g2"));
      await s.putAccess("ha", { grantId: "g2", expiresAt: clock.t + 1000 });
      await s.putRefresh("hr", { grantId: "g2", expiresAt: clock.t + 1000 });
      expect(await s.getAccess("ha")).toBeDefined();
      expect(await s.revokeGrant("g2")).toBe("kid.sealed");
      expect(await s.getAccess("ha")).toBeUndefined();
      expect(await s.getRefresh("hr")).toBeUndefined();
      expect(await s.getGrant("g2")).toMatchObject({ revoked: true, sealedCredential: null });
      expect(await s.revokeGrant("g2")).toBeNull();
      expect(await s.revokeGrant("missing")).toBeNull();
    });

    it("tokens expire", async () => {
      await s.putAccess("hexp", { grantId: "g1", expiresAt: clock.t + 100 });
      expect(await s.getAccess("hexp")).toBeDefined();
      clock.t += 200;
      expect(await s.getAccess("hexp")).toBeUndefined();
    });

    it("refresh tokens are consumed exactly once, even under a race", async () => {
      await s.putRefresh("rr", { grantId: "g1", expiresAt: clock.t + 60_000 });
      const results = await Promise.all(Array.from({ length: 8 }, () => s.consumeRefresh("rr")));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await s.getRefresh("rr")).toMatchObject({ consumed: true });
      expect(await s.consumeRefresh("nope")).toBe(false);
      expect(await s.findAnyToken("rr")).toBeDefined();
    });

    it("authorization codes are single-use under a race and report replays with the grant they made", async () => {
      await s.putCode("code1", code());
      const takes = await Promise.all(Array.from({ length: 8 }, () => s.takeCode("code1")));
      expect(takes.filter((t) => t.status === "ok")).toHaveLength(1);
      expect(takes.filter((t) => t.status === "replay")).toHaveLength(7);
      await s.setCodeGrant("code1", "g1");
      expect(await s.takeCode("code1")).toEqual({ status: "replay", grantId: "g1" });
      expect(await s.takeCode("never")).toEqual({ status: "missing" });
      await s.putCode("code2", code({ expiresAt: clock.t + 10 }));
      clock.t += 20;
      expect(await s.takeCode("code2")).toEqual({ status: "missing" });
    });

    it("pending consent requests round-trip, expire and count", async () => {
      await s.putPending("rid1", pending({ instanceUrl: "https://p.example.com", sealedChallenge: "kid.blob" }));
      expect(await s.getPending("rid1")).toMatchObject({ csrf: "csrf", instanceUrl: "https://p.example.com", sealedChallenge: "kid.blob", attempts: 0 });
      await s.putPending("rid1", pending({ attempts: 2 }));
      expect((await s.getPending("rid1"))?.attempts).toBe(2);
      expect(await s.countPending()).toBeGreaterThanOrEqual(1);
      await s.deletePending("rid1");
      expect(await s.getPending("rid1")).toBeUndefined();
      await s.putPending("rid2", pending({ expiresAt: clock.t + 10 }));
      clock.t += 20;
      expect(await s.getPending("rid2")).toBeUndefined();
    });

    it("rate limiting is a shared fixed window", async () => {
      const r = await Promise.all(Array.from({ length: 12 }, () => s.hit("k", 10, 1000)));
      expect(r.filter(Boolean)).toHaveLength(10);
      clock.t += 1001;
      expect(await s.hit("k", 10, 1000)).toBe(true);
      expect(await s.hit("other", 1, 1000)).toBe(true);
      expect(await s.hit("other", 1, 1000)).toBe(false);
    });

    it("lists idle grants and persists activity (throttled)", async () => {
      await s.putGrant(grant("g3", { lastUsedAt: clock.t - 40 * 86_400_000 }));
      await s.putGrant(grant("g4", { lastUsedAt: clock.t }));
      const idle = (await s.listIdleGrants(clock.t - 30 * 86_400_000)).map((g) => g.id);
      expect(idle).toContain("g3");
      expect(idle).not.toContain("g4");
      await s.touchGrant("g3");
      expect((await s.listIdleGrants(clock.t - 30 * 86_400_000)).map((g) => g.id)).not.toContain("g3");
    });

    it("keeps clients that have live grants and prunes idle unused ones", async () => {
      await s.putClient({ id: "c-idle", name: "x", redirectUris: ["https://claude.ai/x"], createdAt: clock.t, lastUsedAt: clock.t });
      clock.t += 8 * 86_400_000;
      await s.prune();
      expect(await s.getClient("c-idle")).toBeUndefined();
      expect(await s.getClient("c1")).toBeDefined(); // g1/g3/g4 are live grants of c1
    });

    it("ping works", async () => {
      await s.ping();
    });
  });
}

const T0 = 1_900_000_020_000; // fixed, aligned to a minute (divisible by 60_000)
const row = (o: Partial<AuditRow>): AuditRow => ({
  at: T0, node: "n1", kind: "tool", name: "t1", mutation: false, ok: true, status: null, errorClass: null, totalMs: 10, upstreamMs: 5, upstreamCalls: 1,
  scope: "paperclip:read", grantId: "g", client: "Claude", instance: "a.example.com", userId: "u", ...o,
});

function auditContract(name: string, make: () => Promise<Store>) {
  describe(`Audit contract: ${name}`, () => {
    let s: Store;
    beforeAll(async () => {
      s = await make();
      const rows: AuditRow[] = [];
      // t1: totals 10..100 (ten calls), upstream = half; call #9 is a 502 fault, call #10 a caller error
      for (let i = 1; i <= 10; i++) {
        rows.push(row({ at: T0 + i * 1000, totalMs: i * 10, upstreamMs: i * 5, ok: i < 9, status: i === 9 ? 502 : i === 10 ? 400 : null, errorClass: i === 9 ? "upstream_5xx" : i === 10 ? "invalid_input" : null, mutation: i === 1 }));
      }
      // t2 on another tenant, slow, in the NEXT minute; one call never reached Paperclip (no upstream)
      rows.push(row({ at: T0 + 61_000, name: "t2", instance: "b.example.com", totalMs: 3500, upstreamMs: 3400 }));
      rows.push(row({ at: T0 + 62_000, name: "t2", instance: "b.example.com", totalMs: 7, upstreamMs: 0, upstreamCalls: 0, ok: false, status: 403, errorClass: "insufficient_scope" }));
      // http noise must never leak into tool aggregates
      rows.push(row({ at: T0 + 5_000, kind: "http", name: "oauth.token", instance: null, grantId: null, totalMs: 99_999, upstreamMs: null, upstreamCalls: null }));
      await s.insertAudit(rows);
    });
    afterAll(async () => s.close());

    it("totals: percentiles are linear-interpolated, faults are separated from caller errors, http is excluded", async () => {
      const t = await s.auditTotals("tool", T0, T0 + 120_000);
      expect(t).toMatchObject({ count: 12, errors: 3, faults: 1, mutations: 1 });
      // 12 sorted totals: 7,10,20,...,100,3500
      expect(t.p50).toBeCloseTo(55, 5);
      expect(t.p99).toBeGreaterThan(3000);
      expect(t.p99).toBeLessThanOrEqual(3500);
      expect(t.upstreamP95).toBeGreaterThan(0); // only rows with upstream calls
      expect(t.bridgeP95).toBeGreaterThan(0);
      expect((await s.auditTotals("http", T0, T0 + 120_000)).count).toBe(1);
      expect((await s.auditTotals("tool", T0 + 500_000, T0 + 600_000)).count).toBe(0);
    });

    it("series: buckets by time with per-bucket percentiles and latency split", async () => {
      const b = await s.auditSeries("tool", T0, T0 + 120_000, 60_000);
      expect(b.map((x) => x.t)).toEqual([T0, T0 + 60_000]);
      expect(b[0]).toMatchObject({ count: 10, errors: 2, faults: 1 });
      expect(b[0].p50).toBeCloseTo(55, 5);
      expect(b[0].p95).toBeCloseTo(95.5, 5);
      expect(b[0].p99).toBeCloseTo(99.1, 5);
      expect(b[0].avgUpstream).toBeCloseTo(27.5, 5); // 5..50 step 5
      expect(b[0].avgBridge).toBeCloseTo(27.5, 5);
      expect(b[1]).toMatchObject({ count: 2, errors: 1, faults: 0 });
      expect(b[1].avgBridge).toBeCloseTo((100 + 7) / 2, 5); // t2#1: 3500-3400=100; t2#2: 7-0=7
    });

    it("breakdowns by tool, tenant and error class", async () => {
      const byTool = await s.auditBreakdown("tool", "name", T0, T0 + 120_000, 10);
      expect(byTool.map((x) => [x.key, x.count])).toEqual([["t1", 10], ["t2", 2]]);
      expect(byTool[0]).toMatchObject({ errors: 2, faults: 1 });
      const byInst = await s.auditBreakdown("tool", "instance", T0, T0 + 120_000, 10);
      expect(byInst.find((x) => x.key === "b.example.com")).toMatchObject({ count: 2, errors: 1 });
      expect(byInst.find((x) => x.key === "b.example.com")!.upstreamP95).toBeGreaterThan(3000);
      const byErr = await s.auditBreakdown("tool", "errorClass", T0, T0 + 120_000, 10);
      expect(byErr.map((x) => x.key).sort()).toEqual(["insufficient_scope", "invalid_input", "upstream_5xx"]);
      expect((await s.auditBreakdown("tool", "name", T0, T0 + 120_000, 1))).toHaveLength(1);
    });

    it("histogram uses the shared bucket edges", async () => {
      const h = await s.auditHistogram("tool", T0, T0 + 120_000);
      expect(h).toHaveLength(HIST_EDGES.length + 1);
      // <25: 7,10,20 · 25–50: 30,40 · 50–100: 50,60,70,80,90 · 100–200: 100 · … ≥3200: 3500
      expect(h.slice(0, 4)).toEqual([3, 2, 5, 1]);
      expect(h.at(-1)).toBe(1);
      expect(h.reduce((a, b) => a + b, 0)).toBe(12);
    });

    it("slowest and recent", async () => {
      const slow = await s.auditSlowest("tool", T0, T0 + 120_000, 3);
      expect(slow.map((r) => r.totalMs)).toEqual([3500, 100, 90]);
      const recent = await s.auditRecent(0, 4);
      expect(recent).toHaveLength(4);
      expect(recent[0].id!).toBeGreaterThan(recent[1].id!); // newest first
      const tail = await s.auditRecent(recent[3].id!, 50);
      expect(tail.map((r) => r.id)).toEqual(recent.slice(0, 3).map((r) => r.id));
      expect(await s.auditRecent(recent[0].id!, 50)).toEqual([]);
    });

    it("prunes by age", async () => {
      await s.insertAudit([row({ at: T0 - 90 * 86_400_000, name: "ancient" })]);
      expect(await s.pruneAudit(T0 - 30 * 86_400_000)).toBe(1);
      expect(await s.pruneAudit(T0 - 30 * 86_400_000)).toBe(0);
      expect((await s.auditTotals("tool", T0, T0 + 120_000)).count).toBe(12);
    });

    it("an empty window is all zeros, not an error", async () => {
      expect(await s.auditTotals("tool", 1, 2)).toMatchObject({ count: 0, p95: 0, upstreamP95: 0 });
      expect(await s.auditSeries("tool", 1, 2, 1000)).toEqual([]);
    });
  });
}

describe("docs/supabase-schema.sql", () => {
  it("is exactly what the migrations generate (run `npm run schema:sql` after changing migrations/)", () => {
    expect(readFileSync(new URL("../docs/supabase-schema.sql", import.meta.url), "utf8")).toBe(consolidatedSql());
  });
});

contract("memory", async () => new MemoryStore(null, now));
auditContract("memory", async () => new MemoryStore(null, now));

describe.skipIf(!DB)("Postgres", () => {
  const opts = { connectionString: DB!, ssl: "off" as const };
  const reset = async () => {
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    await c.query("drop schema if exists bridge cascade");
    // Simulate Supabase's API roles so we can prove they're locked out.
    for (const r of ["anon", "authenticated"]) await c.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin; end if; end $$`);
    await c.end();
  };

  it("migrates once, idempotently", async () => {
    await reset();
    expect(await migrate(opts)).toEqual(["001_init.sql", "002_audit.sql"]);
    expect(await migrate(opts)).toEqual([]);
  });

  it("locks the schema against Supabase's anon/authenticated roles (RLS + revoked grants)", async () => {
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set role ${role}`);
      await expect(c.query("select * from bridge.grants")).rejects.toThrow(/permission denied/);
      await expect(c.query("select * from bridge.schema_migrations")).rejects.toThrow(/permission denied/);
      await c.query("reset role");
    }
    const rls = await c.query("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'bridge' and relkind = 'r'");
    expect(rls.rows.length).toBeGreaterThanOrEqual(7);
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
    await c.end();
  });

  it("verifies TLS by default and allows explicit relaxations", () => {
    expect(sslOption({})).toEqual({ rejectUnauthorized: true });
    expect(sslOption({ ca: "PEM" })).toEqual({ rejectUnauthorized: true, ca: "PEM" });
    expect(sslOption({ ssl: "require" })).toEqual({ rejectUnauthorized: false });
    expect(sslOption({ ssl: "off" })).toBe(false);
  });

  contract("postgres", async () => {
    await reset();
    await migrate(opts);
    return new PgStore(opts, now);
  });

  // The documented least-privilege setup must be sufficient for the whole Store contract — and nothing more.
  contract("postgres as least-privilege role (docs/least-privilege.sql)", async () => {
    await reset();
    await migrate(opts);
    const admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query("do $$ begin if not exists (select 1 from pg_roles where rolname='bridge_app') then create role bridge_app login; end if; end $$");
    await admin.query(readFileSync(new URL("../docs/least-privilege.sql", import.meta.url), "utf8"));
    await admin.end();
    const appUrl = new URL(DB!);
    appUrl.username = "bridge_app";
    return new PgStore({ connectionString: appUrl.toString(), ssl: "off" }, now);
  });

  auditContract("postgres", async () => {
    await reset();
    await migrate(opts);
    return new PgStore(opts, now);
  });

  auditContract("postgres as least-privilege role", async () => {
    await reset();
    await migrate(opts);
    const admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query("do $$ begin if not exists (select 1 from pg_roles where rolname='bridge_app') then create role bridge_app login; end if; end $$");
    await admin.query(readFileSync(new URL("../docs/least-privilege.sql", import.meta.url), "utf8"));
    await admin.end();
    const appUrl = new URL(DB!);
    appUrl.username = "bridge_app";
    return new PgStore({ connectionString: appUrl.toString(), ssl: "off" }, now);
  });

  it("the paste-into-Supabase script builds the same locked-down schema, is re-runnable, and makes `migrate` a no-op", async () => {
    await reset();
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    const sql = readFileSync(new URL("../docs/supabase-schema.sql", import.meta.url), "utf8");
    await c.query(sql);
    await c.query(sql); // re-run
    expect((await c.query("select version from bridge.schema_migrations order by 1")).rows.map((r) => r.version)).toEqual(["001_init.sql", "002_audit.sql"]);
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set role ${role}`);
      for (const t of ["grants", "tokens", "codes", "pending", "clients", "rate_limits", "audit_events", "schema_migrations"])
        await expect(c.query(`select * from bridge.${t}`), `${role}.${t}`).rejects.toThrow(/permission denied/);
      await c.query("reset role");
    }
    const rls = await c.query("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'bridge' and relkind = 'r'");
    expect(rls.rows.map((r) => r.relname).sort()).toEqual(["audit_events", "clients", "codes", "grants", "pending", "rate_limits", "schema_migrations", "tokens"]);
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
    await c.end();
    expect(await migrate(opts)).toEqual([]); // nothing left to apply
    const store = new PgStore(opts, now);
    await store.insertAudit([row({})]);
    expect((await store.auditRecent(0, 5)).length).toBe(1);
    await store.close();
  });

  it("the audit table is locked against anon/authenticated and idempotently migrated", async () => {
    await reset();
    expect(await migrate(opts)).toEqual(["001_init.sql", "002_audit.sql"]);
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set role ${role}`);
      await expect(c.query("select * from bridge.audit_events")).rejects.toThrow(/permission denied/);
      await c.query("reset role");
    }
    const rls = await c.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'bridge' and relname = 'audit_events'");
    expect(rls.rows[0].relrowsecurity).toBe(true);
    await c.end();
  });

  it("the least-privilege role cannot touch anything outside the bridge tables", async () => {
    const appUrl = new URL(DB!);
    appUrl.username = "bridge_app";
    const c = new pg.Client({ connectionString: appUrl.toString() });
    await c.connect();
    await expect(c.query("create table bridge.evil (x int)")).rejects.toThrow(/permission denied/);
    await expect(c.query("drop table bridge.grants")).rejects.toThrow(/must be owner|permission denied/);
    await expect(c.query("select * from bridge.schema_migrations")).rejects.toThrow(/permission denied/);
    await expect(c.query("create schema evil")).rejects.toThrow(/permission denied/);
    await c.end();
  });
});
