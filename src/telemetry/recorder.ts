import { hostname } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { NodeSample } from "../accounts/types.js";
import { VERSION } from "../version.js";
import type { AuditEvent, AuditRow, AuditStore } from "./types.js";

const clip = (s: string | null | undefined, n: number) => (s == null ? null : String(s).slice(0, n));

export function toRow(e: AuditEvent, node: string): AuditRow {
  return {
    at: Date.parse(e.ts) || Date.now(),
    node,
    kind: e.kind ?? "tool",
    name: clip(e.tool, 100)!,
    mutation: e.mutation,
    ok: e.ok,
    status: e.status ?? null,
    errorClass: clip(e.errorClass, 40),
    totalMs: Math.max(0, Math.round(e.totalMs ?? 0)),
    upstreamMs: e.upstreamMs == null ? null : Math.max(0, Math.round(e.upstreamMs)),
    upstreamCalls: e.upstreamCalls ?? null,
    scope: clip(e.scope, 40),
    grantId: e.actor.startsWith("pcb_g_") ? clip(e.actor, 60) : null,
    client: clip(e.client, 100),
    instance: clip(e.instance, 255),
    userId: clip(e.userId, 200),
    username: clip(e.username, 64),
  };
}

export interface RecorderOptions {
  flushMs?: number;
  maxBatch?: number;
  maxBuffer?: number;
  /** Also print each event as a JSON line on stderr (searchable in the host's log viewer). */
  stderr?: boolean;
  node?: string;
}

/**
 * Collects audit events off the request path. `record()` is synchronous and never throws, so auditing can't slow a call or
 * fail it. Rows are written in batches; if the database is down they are retried, and when the buffer is full the OLDEST are
 * dropped (and counted) — losing telemetry is better than losing the service.
 */
export class AuditRecorder {
  readonly node: string;
  private buf: AuditRow[] = [];
  private timer?: NodeJS.Timeout;
  private flushing: Promise<void> | null = null;
  private flushed = 0;
  private dropped = 0;
  private lastError: string | null = null;

  constructor(
    private store: AuditStore,
    private opts: RecorderOptions = {},
  ) {
    this.node = opts.node ?? `${hostname()}:${process.pid}`;
  }

  record = (e: AuditEvent): void => {
    try {
      if (this.opts.stderr) process.stderr.write(`${JSON.stringify({ audit: e })}\n`);
      this.buf.push(toRow(e, this.node));
      const max = this.opts.maxBuffer ?? 5000;
      if (this.buf.length > max) {
        const over = this.buf.length - max;
        this.buf.splice(0, over);
        this.dropped += over;
      }
      if (this.buf.length >= (this.opts.maxBatch ?? 100)) void this.flush();
    } catch {
      this.dropped += 1;
    }
  };

  start(): void {
    this.timer = setInterval(() => void this.flush(), this.opts.flushMs ?? 2000);
    this.timer.unref();
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (!this.buf.length) return Promise.resolve();
    const batch = this.buf.splice(0, this.buf.length);
    this.flushing = this.store
      .insertAudit(batch)
      .then(() => {
        this.flushed += batch.length;
        this.lastError = null;
      })
      .catch((e: Error) => {
        this.lastError = e.message;
        this.buf.unshift(...batch); // retry on the next tick; the cap above bounds memory
      })
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  stats() {
    return { buffered: this.buf.length, flushed: this.flushed, dropped: this.dropped, lastError: this.lastError };
  }
}

export interface SystemSnapshot {
  dbPingMs: number | null;
  dbPingP95Ms: number | null;
  dbFailures: number;
  loopLagP99Ms: number;
  loopLagMaxMs: number;
  rssMb: number;
  heapUsedMb: number;
  uptimeS: number;
  samples: number;
  /** Last ≤60 ping latencies (ms; null = failed), oldest first, for a sparkline. */
  recentPing: (number | null)[];
}

/** Samples this process's database round-trip, event-loop lag and memory every few seconds. */
export class SystemSampler {
  private pings: (number | null)[] = [];
  private failures = 0;
  private lag = monitorEventLoopDelay({ resolution: 20 });
  private lagP99 = 0;
  private lagMax = 0;
  private timer?: NodeJS.Timeout;
  private samples = 0;

  constructor(
    private db: { ping(): Promise<void> },
    private intervalMs = 5000,
  ) {}

  start(): void {
    this.lag.enable();
    void this.sample();
    this.timer = setInterval(() => void this.sample(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.lag.disable();
  }

  async sample(): Promise<void> {
    const t = performance.now();
    try {
      await this.db.ping();
      this.pings.push(Math.round((performance.now() - t) * 10) / 10);
    } catch {
      this.pings.push(null);
      this.failures += 1;
    }
    if (this.pings.length > 60) this.pings.shift();
    this.lagP99 = this.lag.percentile(99) / 1e6;
    this.lagMax = this.lag.max / 1e6;
    this.lag.reset();
    this.samples += 1;
  }

  snapshot(): SystemSnapshot {
    const ok = this.pings.filter((x): x is number => x != null).sort((a, b) => a - b);
    const mem = process.memoryUsage();
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      dbPingMs: this.pings.length ? this.pings[this.pings.length - 1] : null,
      dbPingP95Ms: ok.length ? round(ok[Math.min(ok.length - 1, Math.floor(ok.length * 0.95))]) : null,
      dbFailures: this.failures,
      loopLagP99Ms: round(this.lagP99),
      loopLagMaxMs: round(this.lagMax),
      rssMb: round(mem.rss / 1048576),
      heapUsedMb: round(mem.heapUsed / 1048576),
      uptimeS: Math.round(process.uptime()),
      samples: this.samples,
      recentPing: [...this.pings],
    };
  }
}

/**
 * Writes this bridge process's health to the database every 30 s, so the separate panel can show it and notice when it STOPS
 * (asleep on a free tier, crashed, or cut off from the database). Failures are swallowed: reporting must never hurt the bridge.
 */
export class NodeReporter {
  private timer?: NodeJS.Timeout;
  private warned = false;

  constructor(
    private store: { recordNodeSample(s: NodeSample): Promise<void> },
    private sampler: SystemSampler,
    private node: string,
    private intervalMs = 30_000,
  ) {}

  async report(): Promise<void> {
    const s = this.sampler.snapshot();
    try {
      await this.store.recordNodeSample({ at: Date.now(), node: this.node, dbPingMs: s.dbPingMs, loopLagP99Ms: s.loopLagP99Ms, rssMb: s.rssMb, heapMb: s.heapUsedMb, uptimeS: s.uptimeS, version: VERSION });
      this.warned = false;
    } catch (e) {
      if (!this.warned) console.error("node report failed:", (e as Error).message);
      this.warned = true;
    }
  }

  start(): void {
    void this.report();
    this.timer = setInterval(() => void this.report(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
