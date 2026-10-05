#!/usr/bin/env node
import { readConfig, readDatabase, readHttpConfig } from "./config.js";
import { consolidatedSql, migrate } from "./migrate.js";
import { OAuthProvider } from "./oauth/provider.js";
import { createStore } from "./store-factory.js";

const USAGE = `paperclip-bridge-admin <command>

  schema-sql     print ONE paste-able SQL script (all migrations) for the Supabase SQL editor
  migrate        apply database migrations (uses DATABASE_MIGRATE_URL if set, else DATABASE_URL; needs a direct/session connection)
  grants         list live grants (no secrets are shown)
  revoke <id>    revoke one grant and delete its stored credential
  sweep          revoke grants idle longer than BRIDGE_IDLE_REVOKE_DAYS
  revoke-all --yes  incident response: revoke EVERY grant, delete all stored credentials, ask each tenant's Paperclip to revoke its key
  rotate-keys    re-seal stored credentials with the current BRIDGE_SECRET (put the old one in BRIDGE_SECRET_PREVIOUS first)
`;

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "schema-sql") {
    process.stdout.write(consolidatedSql());
    return;
  }
  if (cmd === "migrate") {
    const url = process.env.DATABASE_MIGRATE_URL?.trim();
    const db = readDatabase(url ? { ...process.env, DATABASE_URL: url } : process.env);
    if (!db) throw new Error("DATABASE_URL (or DATABASE_MIGRATE_URL) is not set");
    const applied = await migrate(db);
    console.log(applied.length ? `applied: ${applied.join(", ")}` : "database is up to date");
    return;
  }
  if (!["grants", "revoke", "revoke-all", "sweep", "rotate-keys"].includes(cmd ?? "")) {
    console.error(USAGE);
    process.exit(cmd ? 2 : 0);
  }
  const http = readHttpConfig();
  if (!http.oauth) throw new Error("BRIDGE_OAUTH=1 and its settings are required for this command");
  const provider = new OAuthProvider({ config: readConfig(), oauth: http.oauth, bridgeToken: http.bridgeToken, store: createStore(http.oauth) });
  try {
    if (cmd === "grants") {
      for (const g of await provider.listGrants()) {
        console.log([g.id, g.clientName, g.instanceUrl ?? "-", g.scopes.join(","), `last used ${new Date(g.lastUsedAt).toISOString()}`].join("\t"));
      }
    } else if (cmd === "revoke") {
      if (!arg) throw new Error("usage: revoke <grant id>");
      await provider.revokeGrant(arg);
      console.log(`revoked ${arg}`);
    } else if (cmd === "revoke-all") {
      if (arg !== "--yes") throw new Error("this revokes every connection; re-run with --yes");
      const live = await provider.listGrants();
      for (const g of live) await provider.revokeGrant(g.id);
      console.log(`revoked ${live.length} grant(s)`);
    } else if (cmd === "sweep") {
      console.log(`revoked ${await provider.sweep()} idle grant(s)`);
    } else if (cmd === "rotate-keys") {
      console.log(`re-sealed ${await provider.rotateKeys()} credential(s)`);
    }
    // give best-effort upstream revocations a moment to leave
    await new Promise((r) => setTimeout(r, 500));
  } finally {
    await provider.store.close();
  }
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
