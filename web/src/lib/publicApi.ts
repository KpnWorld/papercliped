import { useCallback, useEffect, useState } from "react";
import type { PublicSeries, PublicStats, PublicStatus, PublicWindow } from "../../../src/public-api/types";

export type { PublicSeries, PublicStats, PublicStatus, PublicWindow };

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as T;
}

export interface StatusData {
  status: PublicStatus | null;
  stats: PublicStats | null;
  series: PublicSeries | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
}

/** Live numbers from the bridge's public API, refreshed every 30 s (the API caches for 30 s anyway). */
export function usePublicStatus(window: PublicWindow, refreshMs = 30_000) {
  const [d, setD] = useState<StatusData>({ status: null, stats: null, series: null, error: null, loading: true, updatedAt: null });
  const load = useCallback(async () => {
    try {
      const [status, stats, series] = await Promise.all([
        getJson<PublicStatus>("/api/public/v1/status"),
        getJson<PublicStats>(`/api/public/v1/stats?window=${window}`),
        getJson<PublicSeries>(`/api/public/v1/series?window=${window}`),
      ]);
      setD({ status, stats, series, error: null, loading: false, updatedAt: Date.now() });
    } catch {
      setD((x) => ({ ...x, loading: false, error: "Can't reach the status API right now." }));
    }
  }, [window]);
  useEffect(() => {
    setD((x) => ({ ...x, loading: true }));
    void load();
    const t = setInterval(() => void load(), refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);
  return { ...d, reload: load };
}
