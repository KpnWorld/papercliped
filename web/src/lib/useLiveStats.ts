import { useEffect, useState } from "react";

export interface LiveStats {
  users: number;
  connections: number;
}

/** The public counts from the bridge (/api/public/stats). Null while loading or when the API isn't there (e.g. local preview). */
export function useLiveStats(refreshMs = 60_000): LiveStats | null {
  const [s, setS] = useState<LiveStats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/public/stats", { headers: { accept: "application/json" } });
        const j = r.ok ? await r.json() : null;
        if (alive && j && Number.isFinite(j.users)) setS({ users: j.users, connections: Number(j.connections) || 0 });
      } catch {
        /* offline or no API: keep showing the placeholder */
      }
    };
    load();
    const t = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshMs]);
  return s;
}
