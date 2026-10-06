import type { NodeSample } from "../accounts/types.js";

export type Health = { state: "healthy" | "degraded" | "critical" | "idle"; reasons: string[] };

/** Bridges report every 30 s. Silence for this long means it is down, asleep (free tier), or cannot reach the database. */
export const BRIDGE_SILENT_MS = 120_000;

export function assessHealth(i: { count: number; faults: number; p95: number; dbPingMs: number | null; loopLagP99Ms: number; slowMs: number; recentDbFailed: boolean; /** ms since a bridge last reported; null = none has */ bridgeSilentMs: number | null }): Health {
  const reasons: string[] = [];
  let level = 0;
  const bump = (l: number, why: string) => {
    level = Math.max(level, l);
    reasons.push(why);
  };
  const faultRate = i.count ? i.faults / i.count : 0;
  if (i.count >= 5) {
    if (faultRate >= 0.1) bump(2, `${(faultRate * 100).toFixed(1)}% of calls hit a system fault`);
    else if (faultRate >= 0.02) bump(1, `${(faultRate * 100).toFixed(1)}% of calls hit a system fault`);
    if (i.p95 >= i.slowMs * 3) bump(2, `p95 latency ${Math.round(i.p95)} ms`);
    else if (i.p95 >= i.slowMs) bump(1, `p95 latency ${Math.round(i.p95)} ms`);
  }
  if (i.bridgeSilentMs === null) bump(1, "no bridge has reported yet");
  else if (i.bridgeSilentMs > BRIDGE_SILENT_MS) bump(2, `the bridge has not reported for ${Math.round(i.bridgeSilentMs / 1000)} s (asleep, down, or cannot reach the database)`);
  if (i.recentDbFailed) bump(2, "database ping is failing");
  else if (i.dbPingMs != null && i.dbPingMs >= 1000) bump(2, `database ping ${Math.round(i.dbPingMs)} ms`);
  else if (i.dbPingMs != null && i.dbPingMs >= 250) bump(1, `database ping ${Math.round(i.dbPingMs)} ms`);
  if (i.loopLagP99Ms >= 500) bump(2, `event-loop lag p99 ${Math.round(i.loopLagP99Ms)} ms`);
  else if (i.loopLagP99Ms >= 100) bump(1, `event-loop lag p99 ${Math.round(i.loopLagP99Ms)} ms`);
  if (level === 0) return { state: i.count === 0 ? "idle" : "healthy", reasons: i.count === 0 ? ["no calls in this window"] : [] };
  return { state: level === 2 ? "critical" : "degraded", reasons };
}

/** The newest reading from each bridge process that reported recently. */
export function latestPerNode(samples: NodeSample[], nowMs: number) {
  const m = new Map<string, NodeSample>();
  for (const x of samples) if (!m.has(x.node) || x.at > m.get(x.node)!.at) m.set(x.node, x);
  return [...m.values()].sort((a, b) => b.at - a.at).map((x) => ({ node: x.node, version: x.version, at: x.at, ageMs: Math.max(0, nowMs - x.at), dbPingMs: x.dbPingMs, loopLagP99Ms: x.loopLagP99Ms, rssMb: x.rssMb, heapMb: x.heapMb, uptimeS: x.uptimeS }));
}
