#!/usr/bin/env node
import { readConfig, readHttpConfig } from "./config.js";
import { AdminRoutes } from "./admin/routes.js";
import { migrate } from "./migrate.js";
import { OAuthProvider } from "./oauth/provider.js";
import { createHttpServer } from "./server.js";
import { createStore } from "./store-factory.js";
import { AuditRecorder, SystemSampler } from "./telemetry/recorder.js";
import { MemoryStore } from "./oauth/store.js";

const SWEEP_EVERY_MS = 60 * 60 * 1000;

async function main() {
  const config = readConfig();
  let http;
  try {
    http = readHttpConfig();
  } catch (e) {
    console.error(`Configuration error: ${(e as Error).message}`);
    process.exit(1);
  }
  if (!http.bridgeToken && !http.oauth) {
    console.error("Refusing to start: set BRIDGE_TOKEN (e.g. `openssl rand -hex 32`) and/or BRIDGE_OAUTH=1. The bridge exposes control of your agents.");
    process.exit(1);
  }

  // One store serves OAuth state, audit telemetry and (via the recorder) the dashboard.
  const store = http.oauth ? createStore(http.oauth) : new MemoryStore();
  try {
    await store.ping();
  } catch (e) {
    console.error(`Cannot use the configured store: ${(e as Error).message}`);
    process.exit(1);
  }
  if (http.oauth && /^(1|true|yes|on)$/i.test(process.env.BRIDGE_AUTO_MIGRATE ?? "") && http.oauth.database) {
    // For hosts without a pre-deploy hook. Needs a connection that allows advisory locks (Supabase: session pooler / direct).
    const url = process.env.DATABASE_MIGRATE_URL?.trim();
    const db = url ? { ...http.oauth.database, connectionString: url } : http.oauth.database;
    const applied = await migrate(db).catch((e) => {
      console.error(`Auto-migrate failed: ${e.message}`);
      process.exit(1);
    });
    if (applied.length) console.error(`migrations applied: ${applied.join(", ")}`);
  }

  const provider = http.oauth ? new OAuthProvider({ config, oauth: http.oauth, bridgeToken: http.bridgeToken, store }) : null;
  const recorder = new AuditRecorder(store, { stderr: http.audit.stderr });
  recorder.start();
  const sampler = new SystemSampler(store);
  sampler.start();
  const admin = http.admin
    ? new AdminRoutes({
        token: http.admin.token,
        sessionHours: http.admin.sessionHours,
        secureCookie: !!http.publicUrl?.startsWith("https:"),
        store,
        recorder,
        sampler,
        slowMs: http.audit.slowMs,
        liveGrants: provider ? async () => (await provider.listGrants()).length : undefined,
        mode: http.oauth ? `oauth ${http.oauth.mode}` : "token",
        persistent: !!http.oauth?.database,
        proxyHops: http.oauth?.proxyHops ?? 0,
      })
    : null;

  const server = createHttpServer(config, http, { oauth: provider, recorder, admin });
  server.listen(http.port, http.host, () => {
    const o = http.oauth;
    console.error(
      `paperclip-bridge listening on http://${http.host}:${http.port}` +
        (o ? ` [oauth ${o.mode}${o.mode === "single" ? `, ${o.login} login → ${config.apiUrl}` : ""}, store: ${o.database ? "postgres" : o.dataFile ? "file" : "memory"}, issuer ${o.issuer}]` : ` → ${config.apiUrl}`) +
        (config.readOnly ? " [read-only]" : "") +
        (admin ? " [dashboard: /admin]" : ""),
    );
  });

  let sweeper: NodeJS.Timeout | undefined;
  const run = async () => {
    try {
      const n = provider ? await provider.sweep() : 0;
      if (n) console.error(`sweep: revoked ${n} idle grant(s)`);
      const pruned = await store.pruneAudit(Date.now() - http.audit.retentionDays * 86_400_000);
      if (pruned) console.error(`sweep: pruned ${pruned} audit row(s)`);
    } catch (e) {
      console.error("sweep failed:", (e as Error).message);
    }
  };
  sweeper = setInterval(() => void run(), SWEEP_EVERY_MS);
  sweeper.unref();
  void run();

  const shutdown = (sig: string) => {
    console.error(`${sig}: shutting down`);
    if (sweeper) clearInterval(sweeper);
    sampler.stop();
    server.close(() => void recorder.stop().finally(() => store.close()).finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref(); // don't hang a deploy on a stuck keep-alive
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main();
