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

export interface HttpConfig {
  host: string;
  port: number;
  /** Bearer token callers must present to the bridge's own HTTP endpoints. */
  bridgeToken: string | null;
  /** Public base URL used in the generated OpenAPI `servers` entry. */
  publicUrl: string | null;
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

export function readHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  return {
    host: nonEmpty(env.BRIDGE_HOST) ?? "127.0.0.1",
    port: Number(env.BRIDGE_PORT) > 0 ? Number(env.BRIDGE_PORT) : 3939,
    bridgeToken: nonEmpty(env.BRIDGE_TOKEN),
    publicUrl: nonEmpty(env.BRIDGE_PUBLIC_URL)?.replace(/\/+$/, "") ?? null,
  };
}
