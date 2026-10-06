/**
 * Host roles, from PUBLIC_HOSTS, e.g.
 *   marketing=papercliped.co,www.papercliped.co;docs=docs.papercliped.co;api=mcp.papercliped.co,api.papercliped.co;forum=forum.papercliped.co
 * The first marketing host is canonical (the others redirect to it). Hosts not listed behave like a single-host site.
 */
export type HostRole = "marketing" | "docs" | "api" | "forum";
export interface HostMap {
  marketing: string[];
  docs: string[];
  api: string[];
  forum: string[];
}
const ROLES: HostRole[] = ["marketing", "docs", "api", "forum"];
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/;

export function parseHosts(raw: string | undefined): HostMap {
  const map: HostMap = { marketing: [], docs: [], api: [], forum: [] };
  for (const part of (raw ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [role, list] = part.split("=");
    const r = role?.trim().toLowerCase() as HostRole;
    if (!ROLES.includes(r)) throw new Error(`PUBLIC_HOSTS: unknown role "${role}" (use ${ROLES.join(", ")})`);
    for (const h of (list ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      if (!HOST.test(h)) throw new Error(`PUBLIC_HOSTS: "${h}" is not a host name`);
      if (ROLES.some((x) => map[x].includes(h))) throw new Error(`PUBLIC_HOSTS: "${h}" is listed twice`);
      map[r].push(h);
    }
  }
  return map;
}

export function roleOf(map: HostMap, host: string | undefined): HostRole | null {
  const h = (host ?? "").toLowerCase();
  return ROLES.find((r) => map[r].includes(h)) ?? null;
}
