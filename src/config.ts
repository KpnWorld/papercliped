export interface BridgeConfig {
  /** Paperclip base URL, normalised to end in /api. */
  apiUrl: string;
  /** Board API token (`paperclipai auth login`) or agent key. Optional in local trusted mode. */
  apiKey: string | null;
  /** Default company for company-scoped tools. */
  companyId: string | null;
  /** When true, every tool that mutates Paperclip is refused. */
  readOnly: boolean;
  /** Per-request timeout against the Paperclip API. */
  timeoutMs: number;
}

export interface OAuthConfig {
  /** Canonical public origin of the bridge (the OAuth issuer). */
  issuer: string;
  /** Secret used to seal stored Paperclip credentials. Rotating it disconnects every client. */
  secret: string;
  /** paperclip: sign in via Paperclip's approval flow · static: operator types BRIDGE_TOKEN on the consent page. */
  login: "paperclip" | "static";
  /** JSON file for clients/grants/tokens. Null = memory only (restart disconnects everyone). */
  dataFile: string | null;
  /** Browser-reachable Paperclip origin for the approval link, if different from PAPERCLIP_API_URL. */
  paperclipPublicUrl: string | null;
  accessTtlSec: number;
  refreshTtlSec: number;
  /** Hostnames allowed as https redirect targets for registered clients; "*" allows any https host. */
  redirectHosts: string[];
  /** Trust X-Forwarded-For for rate limiting (only behind a proxy you control). */
  trustProxy: boolean;
}

export interface HttpConfig {
  host: string;
  port: number;
  /** Bearer token callers must present to the bridge's own HTTP endpoints. */
  bridgeToken: string | null;
  /** Public base URL used in the generated OpenAPI `servers` entry. */
  publicUrl: string | null;
  /** Null unless BRIDGE_OAUTH=1. */
  oauth: OAuthConfig | null;
}

const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v?.trim() ?? "");

export function normalizeApiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  return {
    apiUrl: normalizeApiUrl(nonEmpty(env.PAPERCLIP_API_URL) ?? "http://localhost:3100"),
    apiKey: nonEmpty(env.PAPERCLIP_API_KEY),
    companyId: nonEmpty(env.PAPERCLIP_COMPANY_ID),
    readOnly: truthy(env.PAPERCLIP_READ_ONLY),
    timeoutMs: Number(env.PAPERCLIP_TIMEOUT_MS) > 0 ? Number(env.PAPERCLIP_TIMEOUT_MS) : 30_000,
  };
}

const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com", "chatgpt.com", "chat.openai.com", "platform.openai.com"];
const isLoopbackHost = (h: string) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(h);

export function readOAuthConfig(env: NodeJS.ProcessEnv, publicUrl: string | null, bridgeToken: string | null): OAuthConfig | null {
  if (!truthy(env.BRIDGE_OAUTH)) return null;
  if (!publicUrl) throw new Error("BRIDGE_OAUTH=1 requires BRIDGE_PUBLIC_URL (the https origin clients reach the bridge at)");
  const u = new URL(publicUrl);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopbackHost(u.hostname))) {
    throw new Error("BRIDGE_PUBLIC_URL must be https (http is allowed only for localhost development)");
  }
  if (u.pathname !== "/" || u.search || u.hash) throw new Error("BRIDGE_PUBLIC_URL must be an origin with no path");
  const secret = nonEmpty(env.BRIDGE_SECRET);
  if (!secret || secret.length < 32) throw new Error("BRIDGE_OAUTH=1 requires BRIDGE_SECRET of at least 32 characters (`openssl rand -hex 32`)");
  const login = (nonEmpty(env.BRIDGE_LOGIN) ?? "paperclip") as string;
  if (login !== "paperclip" && login !== "static") throw new Error("BRIDGE_LOGIN must be 'paperclip' or 'static'");
  if (login === "static" && !bridgeToken) throw new Error("BRIDGE_LOGIN=static requires BRIDGE_TOKEN (the operator password on the consent page)");
  const hosts = nonEmpty(env.BRIDGE_OAUTH_REDIRECT_HOSTS);
  return {
    issuer: u.origin,
    secret,
    login,
    dataFile: nonEmpty(env.BRIDGE_DATA_FILE),
    paperclipPublicUrl: nonEmpty(env.PAPERCLIP_PUBLIC_URL)?.replace(/\/+$/, "") ?? null,
    accessTtlSec: Number(env.BRIDGE_ACCESS_TTL_SEC) > 0 ? Number(env.BRIDGE_ACCESS_TTL_SEC) : 3600,
    refreshTtlSec: Number(env.BRIDGE_REFRESH_TTL_SEC) > 0 ? Number(env.BRIDGE_REFRESH_TTL_SEC) : 30 * 24 * 3600,
    trustProxy: truthy(env.BRIDGE_TRUST_PROXY),
    redirectHosts: hosts ? hosts.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean) : DEFAULT_REDIRECT_HOSTS,
  };
}

export function readHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const publicUrl = nonEmpty(env.BRIDGE_PUBLIC_URL)?.replace(/\/+$/, "") ?? null;
  const bridgeToken = nonEmpty(env.BRIDGE_TOKEN);
  return {
    host: nonEmpty(env.BRIDGE_HOST) ?? "127.0.0.1",
    port: Number(env.BRIDGE_PORT) > 0 ? Number(env.BRIDGE_PORT) : 3939,
    bridgeToken,
    publicUrl,
    oauth: readOAuthConfig(env, publicUrl, bridgeToken),
  };
}
