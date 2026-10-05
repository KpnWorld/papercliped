#!/usr/bin/env node
/**
 * Preview the operator dashboard with synthetic traffic — no Paperclip, database or OAuth needed.
 *   npm run build && npm run demo      → http://127.0.0.1:3940/admin   (token: demo-admin-token-0123456789abcdef)
 * Backfills two hours of plausible history (including an incident ~25 minutes ago) and keeps generating live calls.
 */
import { AdminRoutes } from "./admin/routes.js";
import { PaperclipClient } from "./client.js";
import type { BridgeConfig } from "./config.js";
import { MemoryStore } from "./oauth/store.js";
import { createHttpServer } from "./server.js";
import { AuditRecorder, SystemSampler } from "./telemetry/recorder.js";
import type { AuditRow } from "./telemetry/types.js";

const TOKEN = "demo-admin-token-0123456789abcdef";
const PORT = Number(process.env.DEMO_PORT) || 3940;

const TOOLS: [string, number, number, boolean, string][] = [
  // name, weight, typical upstream ms, mutation, scope
  ["paperclip_list_agents", 22, 90, false, "paperclip:read"],
  ["paperclip_report_status", 14, 420, false, "paperclip:read"],
  ["paperclip_sync_snapshot", 12, 310, false, "paperclip:read"],
  ["paperclip_sync_changes", 12, 140, false, "paperclip:read"],
  ["paperclip_list_issues", 10, 160, false, "paperclip:read"],
  ["paperclip_report_costs", 6, 520, false, "paperclip:read"],
  ["paperclip_create_issue", 6, 220, true, "paperclip:control"],
  ["paperclip_wake_agent", 5, 180, true, "paperclip:control"],
  ["paperclip_pause_agent", 3, 130, true, "paperclip:control"],
  ["paperclip_decide_approval", 2, 200, true, "paperclip:admin"],
];
const TENANTS: [string, number, number][] = [
  // host, weight, latency multiplier
  ["acme.paperclip.dev", 30, 1], ["globex.example.com", 24, 1.4], ["initech.example.org", 18, 0.8],
  ["hooli.example.net", 12, 2.6], ["umbrella.example.io", 10, 1.1], ["wayne.example.com", 6, 3.4],
];
const CLIENTS = ["Claude", "Claude Code", "ChatGPT"];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T extends [string, number, ...any[]]>(xs: T[]): T => {
  let r = Math.random() * xs.reduce((a, x) => a + x[1], 0);
  for (const x of xs) if ((r -= x[1]) <= 0) return x;
  return xs[0];
};
const logn = (median: number, sigma = 0.45) => median * Math.exp(sigma * (Math.random() + Math.random() + Math.random() - 1.5) * 1.6);

function synth(at: number, incident: boolean): AuditRow {
  const [name, , up, mutation, scope] = pick(TOOLS);
  const [host, , mult] = pick(TENANTS);
  const slowTenant = incident && host === "hooli.example.net";
  const upstream = Math.round(logn(up * mult * (slowTenant ? 5 : 1)));
  const bridge = Math.round(logn(6, 0.5) + (incident ? rnd(0, 30) : 0));
  const roll = Math.random();
  const fault = (slowTenant && roll < 0.35) || roll < 0.006;
  const rejected = !fault && roll > 0.94;
  const errorClass = fault ? (Math.random() < 0.7 ? "upstream_5xx" : "upstream_unreachable") : rejected ? (Math.random() < 0.6 ? "invalid_input" : "insufficient_scope") : null;
  return {
    at, node: "demo:1", kind: "tool", name, mutation, ok: !errorClass, status: fault ? (errorClass === "upstream_unreachable" ? 502 : 503) : rejected ? (errorClass === "invalid_input" ? 400 : 403) : null,
    errorClass, totalMs: rejected ? bridge : (fault && errorClass === "upstream_unreachable" ? 10_000 : upstream) + bridge, upstreamMs: rejected ? 0 : fault && errorClass === "upstream_unreachable" ? 10_000 : upstream, upstreamCalls: rejected ? 0 : 1,
    scope, grantId: `pcb_g_${host.slice(0, 4)}`, client: CLIENTS[Math.floor(Math.random() * CLIENTS.length)], instance: host, userId: null,
  };
}

async function main() {
  const store = new MemoryStore();
  const now = Date.now();
  const rows: AuditRow[] = [];
  for (let t = now - 2 * 3600_000; t < now; t += rnd(900, 3200)) {
    const wave = 0.6 + 0.4 * Math.sin((t - now) / 900_000);
    if (Math.random() > wave) continue;
    const mins = (now - t) / 60_000;
    rows.push(synth(t, mins > 12 && mins < 28)); // incident 12–28 minutes ago
  }
  for (let t = now - 2 * 3600_000; t < now; t += rnd(2000, 9000)) {
    rows.push({ at: t, node: "demo:1", kind: "http", name: Math.random() < 0.7 ? "mcp" : Math.random() < 0.6 ? "oauth.token" : "oauth.authorize", mutation: false, ok: Math.random() > 0.03, status: 200, errorClass: null, totalMs: Math.round(logn(25, 0.6)), upstreamMs: null, upstreamCalls: null, scope: null, grantId: null, client: null, instance: null, userId: null });
  }
  await store.insertAudit(rows);

  const recorder = new AuditRecorder(store, { node: "demo:1" });
  recorder.start();
  const sampler = new SystemSampler({ ping: async () => void (await new Promise((r) => setTimeout(r, rnd(2, 14)))) }, 2000);
  sampler.start();
  const admin = new AdminRoutes({ token: TOKEN, sessionHours: 8, secureCookie: false, store, recorder, sampler, slowMs: 1500, mode: "demo (synthetic)", persistent: false, liveGrants: async () => 6 });
  const config: BridgeConfig = { apiUrl: "http://127.0.0.1:9/api", apiKey: null, companyId: null, readOnly: true, timeoutMs: 1000 };
  const server = createHttpServer(config, { host: "127.0.0.1", port: PORT, bridgeToken: null, publicUrl: null, oauth: null, admin: { token: TOKEN, sessionHours: 8 }, audit: { retentionDays: 1, slowMs: 1500, stderr: false } }, { recorder, admin, client: new PaperclipClient(config) });
  server.listen(PORT, "127.0.0.1", () => console.error(`demo dashboard: http://127.0.0.1:${PORT}/admin   token: ${TOKEN}`));

  const tick = () => {
    const r = synth(Date.now(), process.env.DEMO_INCIDENT === "1");
    recorder.record({ ts: new Date(r.at).toISOString(), kind: "tool", tool: r.name, mutation: r.mutation, ok: r.ok, status: r.status ?? undefined, errorClass: r.errorClass ?? undefined, actor: r.grantId ?? "x", client: r.client ?? undefined, instance: r.instance ?? undefined, scope: r.scope ?? undefined, totalMs: r.totalMs, upstreamMs: r.upstreamMs ?? undefined, upstreamCalls: r.upstreamCalls ?? undefined });
    setTimeout(tick, rnd(250, 1400));
  };
  tick();
}

void main();
