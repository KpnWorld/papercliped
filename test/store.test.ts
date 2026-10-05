import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { PgStore, sslOption } from "../src/oauth/pg-store.js";
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

contract("memory", async () => new MemoryStore(null, now));

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
    expect(await migrate(opts)).toEqual(["001_init.sql"]);
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
