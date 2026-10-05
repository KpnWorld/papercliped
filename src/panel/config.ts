import { BlockList, isIP } from "node:net";
import type { PgOptions } from "../oauth/pg-store.js";

/**
 * Configuration of the SEPARATE operator panel. It has its own variables on purpose: it must never receive the bridge's secrets
 * (BRIDGE_SECRET, bridge database credentials). It only needs a read-only database URL and its own admin token.
 */
export interface PanelConfig {
  host: string;
  port: number;
  token: string;
  sessionHours: number;
  /** Public https URL of the panel (only used to mark the session cookie Secure). */
  publicUrl: string | null;
  slowMs: number;
  communityName: string;
  proxyHops: number;
  /** If set, only these client addresses (IPs or IPv4 CIDRs) may reach the panel at all. */
  allowedIps: string[] | null;
  /** Read-only Postgres role (docs/panel-role.sql). Null only in demo mode. */
  database: PgOptions | null;
  demo: boolean;
}

const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const posInt = (v: string | undefined, d: number) => (Number(v) > 0 ? Math.floor(Number(v)) : d);
const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v?.trim() ?? "");

export function readPanelConfig(env: NodeJS.ProcessEnv = process.env): PanelConfig {
  const token = nonEmpty(env.PANEL_ADMIN_TOKEN);
  if (!token || token.length < 24) throw new Error("PANEL_ADMIN_TOKEN is required and must be at least 24 characters (`openssl rand -hex 32`)");
  const demo = truthy(env.PANEL_DEMO);
  const url = nonEmpty(env.PANEL_DATABASE_URL);
  if (!demo && !url) throw new Error("PANEL_DATABASE_URL is required (the read-only panel_ro role; see docs/panel-role.sql). Set PANEL_DEMO=1 to preview with fake data.");
  for (const leaked of ["BRIDGE_SECRET", "BRIDGE_SECRET_PREVIOUS", "DATABASE_URL", "DATABASE_MIGRATE_URL"]) {
    if (nonEmpty(env[leaked])) throw new Error(`${leaked} is set in the panel's environment. The panel is a separate program: give it ONLY its own PANEL_* variables, so a compromise of the panel can never expose the bridge's secrets or write access.`);
  }
  const ssl = (nonEmpty(env.PANEL_DATABASE_SSL) ?? "verify") as string;
  if (!["off", "require", "verify"].includes(ssl)) throw new Error("PANEL_DATABASE_SSL must be off, require or verify");
  const allow = (env.PANEL_ALLOWED_IPS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const a of allow) if (!ipMatcher([a])) throw new Error(`PANEL_ALLOWED_IPS contains an invalid entry: ${a}`);
  const secure = nonEmpty(env.PANEL_PUBLIC_URL)?.replace(/\/+$/, "") ?? null;
  return {
    host: nonEmpty(env.PANEL_HOST) ?? (nonEmpty(env.PORT) ? "0.0.0.0" : "127.0.0.1"),
    port: posInt(env.PANEL_PORT ?? env.PORT, 3940),
    token,
    sessionHours: posInt(env.PANEL_SESSION_HOURS, 8),
    publicUrl: secure,
    slowMs: posInt(env.PANEL_SLOW_MS, 1500),
    communityName: (nonEmpty(env.PANEL_COMMUNITY_NAME) ?? "cliped").slice(0, 40),
    proxyHops: env.PANEL_PROXY_HOPS !== undefined ? Math.max(0, Math.floor(Number(env.PANEL_PROXY_HOPS)) || 0) : 0,
    allowedIps: allow.length ? allow : null,
    database: url ? { connectionString: url, ssl: ssl as PgOptions["ssl"], ca: nonEmpty(env.PANEL_DATABASE_CA)?.replace(/\\n/g, "\n") ?? undefined, max: 4 } : null,
    demo,
  };
}

/** Matcher for a list of IPs / IPv4 CIDRs. Returns null if any entry is invalid. */
export function ipMatcher(entries: string[]): ((ip: string) => boolean) | null {
  const list = new BlockList();
  for (const e of entries) {
    const [addr, bits] = e.split("/");
    const fam = isIP(addr);
    if (!fam) return null;
    if (bits === undefined) list.addAddress(addr, fam === 4 ? "ipv4" : "ipv6");
    else {
      const n = Number(bits);
      if (!Number.isInteger(n) || n < 0 || n > (fam === 4 ? 32 : 128)) return null;
      list.addSubnet(addr, n, fam === 4 ? "ipv4" : "ipv6");
    }
  }
  return (ip: string) => {
    const clean = ip.replace(/^::ffff:/i, "");
    const fam = isIP(clean);
    return fam ? list.check(clean, fam === 4 ? "ipv4" : "ipv6") : false;
  };
}
