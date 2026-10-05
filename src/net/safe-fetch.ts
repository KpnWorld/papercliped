import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Egress guard for a multi-tenant bridge: every request goes to a hostname a stranger typed,
 * so we must never let it reach our own network, cloud metadata, or anything non-public.
 *
 *  1. URLs are validated structurally (https, DNS name, allowed port, no credentials).
 *  2. Addresses are validated INSIDE the connection's DNS lookup, so the IP we check is the IP
 *     we connect to (no check-then-connect gap for DNS rebinding). If ANY returned address is
 *     non-public the whole name is refused.
 *  3. No redirects, hard timeouts, capped response size, no cookies.
 */

export class UnsafeUrlError extends Error {}

const blocked = new BlockList();
const v4 = (net: string, prefix: number) => blocked.addSubnet(net, prefix, "ipv4");
const v6 = (net: string, prefix: number) => blocked.addSubnet(net, prefix, "ipv6");
for (const [n, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) v4(n, p);
for (const [n, p] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) v6(n, p);

export function isPublicAddress(addr: string): boolean {
  const family = isIP(addr);
  if (!family) return false;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is never a legitimate public answer. (Don't put it in the BlockList:
  // Node matches plain IPv4 addresses against the mapped range, which would block every IPv4 host.)
  if (family === 6 && /^(0{0,4}:){0,5}:?ffff:/i.test(addr)) return false;
  return !blocked.check(addr, family === 4 ? "ipv4" : "ipv6");
}

const BAD_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".private", ".arpa"];

export interface UrlPolicy {
  allowedPorts: number[];
  /** Hostnames that must never be targeted (e.g. the bridge's own host). */
  denyHosts: string[];
}

export const DEFAULT_URL_POLICY: UrlPolicy = { allowedPorts: [443], denyHosts: [] };

/** Validate a user-supplied Paperclip address and reduce it to its origin. Throws UnsafeUrlError with a user-safe message. */
export function parseInstanceUrl(input: string, policy: UrlPolicy = DEFAULT_URL_POLICY): URL {
  const raw = input.trim();
  if (!raw || raw.length > 300) throw new UnsafeUrlError("Enter the full https:// address of your Paperclip instance.");
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid address.");
  }
  if (u.protocol !== "https:") throw new UnsafeUrlError("Only https:// addresses are supported.");
  if (u.username || u.password) throw new UnsafeUrlError("The address must not contain a username or password.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host) || host.startsWith("[")) throw new UnsafeUrlError("Use a hostname, not an IP address.");
  if (!host.includes(".") || host === "localhost" || BAD_SUFFIXES.some((s) => host.endsWith(s)))
    throw new UnsafeUrlError("That hostname is not publicly reachable. The hosted bridge can only connect to Paperclip instances on the public internet.");
  if (policy.denyHosts.some((d) => host === d.toLowerCase())) throw new UnsafeUrlError("That address is not allowed.");
  const port = u.port ? Number(u.port) : 443;
  if (!policy.allowedPorts.includes(port)) throw new UnsafeUrlError(`Port ${port} is not allowed (allowed: ${policy.allowedPorts.join(", ")}).`);
  return new URL(`https://${host}${port === 443 ? "" : `:${port}`}`);
}

type LookupCb = (err: Error | null, address?: any, family?: number) => void;

/** DNS lookup that refuses non-public answers. Used as undici's connect.lookup so validation and connection share one resolution. */
export function guardedLookup(hostname: string, options: any, callback: LookupCb) {
  const opts = typeof options === "function" ? {} : (options ?? {});
  const cb: LookupCb = typeof options === "function" ? options : callback;
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length) return cb(new UnsafeUrlError("Hostname did not resolve."));
    const bad = addrs.find((a) => !isPublicAddress(a.address));
    if (bad) return cb(new UnsafeUrlError("Hostname resolves to a non-public address."));
    if (opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Test seam: replace the connection-level lookup (never set in production). */
  lookup?: typeof guardedLookup;
  /** Test seam: extra CA for a local test server. */
  ca?: string;
}

/** A `fetch` that only talks to public hosts, never follows redirects, caps time and size, and returns a plain Response. */
export function createSafeFetch(opts: SafeFetchOptions = {}): typeof fetch {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const agent = new Agent({
    connect: { lookup: opts.lookup ?? guardedLookup, timeout: 10_000, ...(opts.ca ? { ca: opts.ca } : {}) },
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    maxResponseSize: maxBytes,
    pipelining: 0,
  });
  return (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new UnsafeUrlError("Only https is allowed for upstream requests.");
    const res = await undiciFetch(url, { ...init, dispatcher: agent, redirect: "error", signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(`Upstream response exceeded ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    }
    const body = total ? Buffer.concat(chunks) : null;
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers as any });
  }) as typeof fetch;
}
