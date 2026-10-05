import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { sslOption, type PgOptions } from "./oauth/pg-store.js";

const LOCK_ID = 7_351_001; // arbitrary, stable advisory-lock key for "bridge migrations"

/** Apply migrations/*.sql in order, once each, under an advisory lock. Needs a direct or session-mode connection. */
export async function migrate(opts: PgOptions, dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations")): Promise<string[]> {
  const client = new pg.Client({ connectionString: opts.connectionString, ssl: sslOption(opts) });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_ID]);
    await client.query("create schema if not exists bridge");
    await client.query("create table if not exists bridge.schema_migrations (version text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query("select version from bridge.schema_migrations")).rows.map((r) => r.version as string));
    for (const f of readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()) {
      if (done.has(f)) continue;
      await client.query("begin");
      try {
        await client.query(readFileSync(join(dir, f), "utf8"));
        await client.query("insert into bridge.schema_migrations (version) values ($1)", [f]);
        await client.query("commit");
        applied.push(f);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
    // schema_migrations is created outside the numbered files, so lock it down here too.
    await client.query("alter table bridge.schema_migrations enable row level security");
    await client.query("revoke all on bridge.schema_migrations from public");
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    await client.end();
  }
  return applied;
}
