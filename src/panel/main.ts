#!/usr/bin/env node
/**
 * The operator panel — a SEPARATE program from the bridge. It holds no bridge secrets and connects to the database with the
 * read-only `panel_ro` role (docs/panel-role.sql), so even a fully compromised panel can read only the safe views.
 */
import { performance } from "node:perf_hooks";
import { readPanelConfig } from "./config.js";
import { PanelRoutes } from "./routes.js";
import { createPanelServer } from "./server.js";
import { PgPanelStore } from "../oauth/pg-store.js";
import type { PanelData } from "../oauth/store.js";

async function main() {
  let config;
  try {
    config = readPanelConfig();
  } catch (e) {
    console.error(`Configuration error: ${(e as Error).message}`);
    process.exit(1);
  }
  if (config.demo) {
    const { runDemo } = await import("../demo.js");
    return void (await runDemo(config));
  }
  const store: PanelData = new PgPanelStore(config.database!);
  try {
    await store.ping();
  } catch (e) {
    console.error(`Cannot reach the database: ${(e as Error).message}`);
    process.exit(1);
  }
  await startPanel(config, store);
}

/** Shared by the real panel and the demo. */
export async function startPanel(config: ReturnType<typeof readPanelConfig>, store: PanelData, mode = "postgres (read-only)") {
  let pingMs: number | null = null;
  const sample = async () => {
    const t = performance.now();
    try {
      await store.ping();
      pingMs = Math.round((performance.now() - t) * 10) / 10;
    } catch {
      pingMs = null;
    }
  };
  void sample();
  const timer = setInterval(() => void sample(), 10_000);
  timer.unref();

  const hits = new Map<string, number[]>();
  const limit = (key: string, n: number, windowMs: number) => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= n) return false;
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };

  const routes = new PanelRoutes({
    token: config.token,
    sessionHours: config.sessionHours,
    secureCookie: !!config.publicUrl?.startsWith("https:"),
    store,
    slowMs: config.slowMs,
    communityName: config.communityName,
    mode,
    persistent: !config.demo,
    proxyHops: config.proxyHops,
    limit,
    panelPingMs: () => pingMs,
  });
  const server = createPanelServer({ routes, allowedIps: config.allowedIps, proxyHops: config.proxyHops });
  server.listen(config.port, config.host, () => console.error(`papercliped panel listening on http://${config.host}:${config.port}${config.allowedIps ? " [ip allow-list]" : ""}`));
  const shutdown = (sig: string) => {
    console.error(`${sig}: shutting down`);
    clearInterval(timer);
    server.close(() => void store.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("panel/main.js")) void main();
