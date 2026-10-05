/** Fixed-window in-memory limiter. Single-process only; enough to blunt brute force and registration spam. */
export class RateLimiter {
  private hits = new Map<string, { n: number; resetAt: number }>();

  constructor(private now: () => number = Date.now) {}

  allow(key: string, limit: number, windowMs: number): boolean {
    const t = this.now();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { n: 1, resetAt: t + windowMs });
      return true;
    }
    cur.n += 1;
    return cur.n <= limit;
  }
}
