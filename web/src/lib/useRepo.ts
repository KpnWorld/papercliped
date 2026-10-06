import { useEffect, useState } from "react";

/** GitHub stars for the repo, served by the bridge (it fetches and caches them, so the browser never calls GitHub). */
let cache: Promise<number | null> | null = null;
export function useRepoStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    cache ??= fetch("/api/public/v1/repo", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && Number.isFinite(j.stars) ? (j.stars as number) : null))
      .catch(() => null);
    let alive = true;
    void cache.then((n) => alive && setStars(n));
    return () => {
      alive = false;
    };
  }, []);
  return stars;
}
export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n));
/** For tests. */
export const resetRepoCache = () => {
  cache = null;
};
