import { usernameKey } from "../src/accounts/username.js";
import type { Store } from "../src/oauth/store.js";
import type { AuditRow } from "../src/telemetry/types.js";

// Strings that must never leave the bridge through the public API.
export const SECRET = ["zelda.fox7", "ZELDA.FOX7", "Hidden42", "acct_zelda", "g_zelda_grant", "paperclip.zelda-corp.example", "zelda-corp", "ZeldaBot Desktop", "u_zelda", "weird_reason_zelda", "203.0.113.9"];


export function row(t: number, over: Partial<AuditRow>): AuditRow {
  return { at: t - 60_000, node: "node-a", kind: "tool", name: "paperclip_list_agents", mutation: false, ok: true, status: 200, errorClass: null, totalMs: 120, upstreamMs: 80, upstreamCalls: 1, scope: "paperclip:read", grantId: "g_zelda_grant", client: "ZeldaBot Desktop", instance: "paperclip.zelda-corp.example", userId: "u_zelda", username: "zelda.fox7", ...over };
}

export async function seed(store: Store, t: number) {
  await store.createAccount({ id: "acct_zelda", username: "zelda.fox7", usernameKey: usernameKey("zelda.fox7"), secretHash: "x", createdAt: t - 1000, lastLoginAt: null, disabled: false, anonymous: true, alias: "Hidden42" });
  await store.putGrant({ id: "g_zelda_grant", clientId: "c", clientName: "ZeldaBot Desktop", userId: "u_zelda", scopes: ["paperclip:read"], resource: "r", instanceUrl: "https://paperclip.zelda-corp.example", sealedCredential: "s", accountId: "acct_zelda", username: "Hidden42", createdAt: t, lastUsedAt: t, revoked: false });
  for (const [kind, detail] of [["started", null], ["started", null], ["started", null], ["completed", null], ["joined", "connect"], ["connect_failed", "unreachable"], ["login_failed", "bad_credentials"], ["connect_failed", "weird_reason_zelda"]] as const)
    await store.insertUserEvent({ at: t - 120_000, accountId: "acct_zelda", username: "zelda.fox7", kind, detail });
  await store.insertAudit([
    row(t, {}),
    row(t, { name: "paperclip_pause_agent", mutation: true }),
    row(t, { ok: false, status: 403, errorClass: "insufficient_scope" }),
    row(t, { ok: false, status: 502, errorClass: "upstream_5xx", totalMs: 900 }),
    row(t, { name: "not_a_catalogue_tool_zelda-corp", ok: false, errorClass: "made_up_class_zelda" }),
    row(t, { kind: "http", name: "oauth.token", ok: false, status: 401, errorClass: "unauthorized" }),
  ]);
  await store.recordNodeSample({ at: t - 10_000, node: "node-a", dbPingMs: 12, loopLagP99Ms: 8, rssMb: 140, heapMb: 60, uptimeS: 3600, version: "2.0.0" });
}

