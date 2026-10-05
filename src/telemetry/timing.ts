import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-tool-call timing context. The Paperclip client records each upstream request's [start, end] here, so
 * "time spent waiting on Paperclip" is the UNION of those intervals (parallel requests aren't double-counted),
 * and "bridge time" is everything else.
 */
export interface CallTimer {
  intervals: [number, number][];
}

const als = new AsyncLocalStorage<CallTimer>();

export const runTimed = <T>(timer: CallTimer, fn: () => Promise<T>): Promise<T> => als.run(timer, fn);

export async function trackUpstream<T>(fn: () => Promise<T>): Promise<T> {
  const timer = als.getStore();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    timer?.intervals.push([start, performance.now()]);
  }
}

export function unionMs(intervals: [number, number][]): number {
  if (!intervals.length) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curS, curE] = sorted[0];
  for (const [s, e] of sorted.slice(1)) {
    if (s <= curE) curE = Math.max(curE, e);
    else {
      total += curE - curS;
      [curS, curE] = [s, e];
    }
  }
  return total + (curE - curS);
}
