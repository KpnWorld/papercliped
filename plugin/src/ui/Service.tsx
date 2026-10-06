import { useEffect, useState } from "react";
import { MetricCard, StatusBadge } from "@paperclipai/plugin-sdk/ui";
import { pct } from "./format.js";
import { muted, panel, row } from "./look.js";
import type { Service as S } from "./types.js";

const TEXT = { ok: "All systems normal", degraded: "Degraded performance", down: "Major problem" } as const;
const BADGE = { ok: "ok", degraded: "warning", down: "error" } as const;

/** The Papercliped service's public status (aggregate numbers only), refreshed every minute. Needs no link. */
export function ServicePanel({ load }: { load: () => Promise<unknown> }) {
  const [s, setS] = useState<S | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const run = () => load().then((x) => alive && (setS(x as S), setErr(false))).catch(() => alive && setErr(true));
    run();
    const t = setInterval(run, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load]);
  return (
    <section aria-label="Papercliped service" style={panel}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <strong>Papercliped service</strong>
        {err ? <StatusBadge label="Status unavailable" status="pending" /> : s ? <StatusBadge label={TEXT[s.status]} status={BADGE[s.status]} /> : <span style={muted}>Checking…</span>}
      </div>
      {s && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 12 }}>
            <MetricCard label="People" value={s.users ?? "—"} />
            <MetricCard label="Live connections" value={s.liveConnections ?? "—"} />
            <MetricCard label="Requests OK" value={pct(s.requestSuccessRate)} unit="%" />
            <MetricCard label="p95 latency" value={s.p95Ms ?? "—"} unit="ms" />
          </div>
          <p style={muted}>
            Version {s.version} · <a href={s.statusPage} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>status page</a>
          </p>
        </>
      )}
    </section>
  );
}
