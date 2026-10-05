#!/usr/bin/env node
/**
 * Preview the operator PANEL with synthetic traffic — no Paperclip, bridge or database needed.
 *   npm run build && npm run demo      → http://127.0.0.1:3940/   (token: demo-admin-token-0123456789abcdef)
 * Backfills two hours of plausible history (including an incident ~25 minutes ago) and keeps generating live calls.
 */
import { MemoryStore } from "./oauth/store.js";
import type { PanelConfig } from "./panel/config.js";
import { startPanel } from "./panel/main.js";
import type { UserEvent } from "./accounts/types.js";
import type { AuditRow } from "./telemetry/types.js";


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
const USER_OF: Record<string, string> = { "acme.paperclip.dev": "Ann02", "globex.example.com": "globex_ops7", "initech.example.org": "Bo41", "hooli.example.net": "hooli.nuc3", "umbrella.example.io": "Kit17", "wayne.example.com": "b.wayne#1" };

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
    scope, grantId: `pcb_g_${host.slice(0, 4)}`, client: CLIENTS[Math.floor(Math.random() * CLIENTS.length)], instance: host, userId: null, username: USER_OF[host] ?? null,
  };
}

export async function runDemo(config: PanelConfig) {
  const store = new MemoryStore();
  const node = "demo:1";
  const now = Date.now();
  const rows: AuditRow[] = [];
  for (let t = now - 2 * 3600_000; t < now; t += rnd(900, 3200)) {
    const wave = 0.6 + 0.4 * Math.sin((t - now) / 900_000);
    if (Math.random() > wave) continue;
    const mins = (now - t) / 60_000;
    rows.push(synth(t, mins > 12 && mins < 28)); // incident 12–28 minutes ago
  }
  for (let t = now - 2 * 3600_000; t < now; t += rnd(2000, 9000)) {
    rows.push({ at: t, node: "demo:1", kind: "http", name: Math.random() < 0.7 ? "mcp" : Math.random() < 0.6 ? "oauth.token" : "oauth.authorize", mutation: false, ok: Math.random() > 0.03, status: 200, errorClass: null, totalMs: Math.round(logn(25, 0.6)), upstreamMs: null, upstreamCalls: null, scope: null, grantId: null, client: null, instance: null, userId: null, username: null });
  }
  await store.insertAudit(rows);

  // community history: everyone joined over the last two hours, then signed in / out now and then
  const users = Object.values(USER_OF);
  const ev = (at: number, kind: UserEvent["kind"], username: string | null, detail: string | null = null): UserEvent => ({ at, accountId: username ? `acct_${username}` : null, username, kind, detail });
  let t = now - 115 * 60_000;
  for (const u of users) {
    t += rnd(60_000, 14 * 60_000);
    await store.insertUserEvent(ev(t - 40_000, "started", null));
    await store.insertUserEvent(ev(t, "joined", u, "demo"));
    await store.insertUserEvent(ev(t + 9_000, "completed", u, "new"));
  }
  for (let at = now - 110 * 60_000; at < now; at += rnd(2 * 60_000, 9 * 60_000)) {
    const u = users[Math.floor(Math.random() * users.length)];
    const roll = Math.random();
    await store.insertUserEvent(ev(at - 20_000, "started", null));
    if (roll < 0.62) { await store.insertUserEvent(ev(at, "login", u, "claude.ai")); await store.insertUserEvent(ev(at + 5_000, "completed", u, "login")); }
    else if (roll < 0.74) await store.insertUserEvent(ev(at, "login_failed", Math.random() < 0.5 ? u : null, "bad_credentials"));
    else if (roll < 0.84) await store.insertUserEvent(ev(at, "connect_failed", null, ["denied", "unreachable", "expired", "invalid_instance"][Math.floor(Math.random() * 4)]));
    else if (roll < 0.93) { await store.insertUserEvent(ev(at, "updated", u, "reconnect")); await store.insertUserEvent(ev(at + 6_000, "completed", u, "connect")); }
    else await store.insertUserEvent(ev(at, "left", u, Math.random() < 0.5 ? "disconnected" : "idle"));
  }

  // synthetic accounts so the user count is non-zero
  for (const u of users) await store.createAccount({ id: `acct_${u}`, username: u, usernameKey: u.toLowerCase(), secretHash: "demo", createdAt: now, lastLoginAt: null, disabled: false });
  const nodeSample = () => store.recordNodeSample({ at: Date.now(), node, dbPingMs: rnd(2, 14), loopLagP99Ms: rnd(1, 9), rssMb: rnd(90, 110), heapMb: rnd(40, 60), uptimeS: Math.round(process.uptime()), version: "demo" });
  for (let at = now - 2 * 3600_000; at < now; at += 30_000) await store.recordNodeSample({ at, node, dbPingMs: rnd(2, 14), loopLagP99Ms: rnd(1, 9), rssMb: rnd(90, 110), heapMb: rnd(40, 60), uptimeS: Math.round((at - (now - 2 * 3600_000)) / 1000), version: "demo" });
  setInterval(() => void nodeSample(), 30_000).unref();

  await startPanel({ ...config, token: config.token, slowMs: 1500, communityName: "cliped" }, store, "demo (synthetic)");
  console.error(`demo panel: http://127.0.0.1:${config.port}/   token: ${config.token}`);

  const tick = () => {
    const r = synth(Date.now(), process.env.DEMO_INCIDENT === "1");
    void store.insertAudit([r]);
    setTimeout(tick, rnd(250, 1400));
  };
  tick();

  let n = 0;
  const community = () => {
    const now2 = Date.now();
    const u = users[Math.floor(Math.random() * users.length)];
    const roll = Math.random();
    void store.insertUserEvent(ev(now2 - 15_000, "started", null));
    if (roll < 0.5) { void store.insertUserEvent(ev(now2, "login", u, "claude.ai")); void store.insertUserEvent(ev(now2 + 1, "completed", u, "login")); }
    else if (roll < 0.62) void store.insertUserEvent(ev(now2, "login_failed", null, "bad_credentials"));
    else if (roll < 0.72) void store.insertUserEvent(ev(now2, "updated", u, "secret_rotated"));
    else if (roll < 0.84) { const name = `new.user${100 + ++n}`; void store.insertUserEvent(ev(now2, "joined", name, "demo")); void store.insertUserEvent(ev(now2 + 1, "completed", name, "new")); }
    else if (roll < 0.92) void store.insertUserEvent(ev(now2, "connect_failed", null, "denied"));
    else void store.insertUserEvent(ev(now2, "left", u, "disconnected"));
    setTimeout(community, rnd(3000, 9000));
  };
  community();
}

if (process.argv[1]?.endsWith("demo.js")) {
  const { readPanelConfig } = await import("./panel/config.js");
  void runDemo(readPanelConfig({ PANEL_DEMO: "1", PANEL_ADMIN_TOKEN: "demo-admin-token-0123456789abcdef", PANEL_PORT: process.env.DEMO_PORT ?? "3940" }));
}
