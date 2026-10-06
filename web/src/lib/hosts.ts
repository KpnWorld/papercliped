/**
 * Which host serves which pages. The bridge writes the host map into <meta name="pcl-hosts"> (for example
 * {"marketing":"papercliped.co","docs":"docs.papercliped.co"}); without it, every page is on the current host.
 *
 * Code always uses the canonical paths ("/docs/permissions", "/community"); resolveHref turns them into the right URL:
 * relative on the same host, absolute when the page lives on another one. On the docs host, docs live at /topics/…
 */
export interface Hosts {
  marketing?: string;
  docs?: string;
}

let cached: Hosts | null = null;
export function hosts(): Hosts {
  if (cached) return cached;
  try {
    const raw = document.querySelector('meta[name="pcl-hosts"]')?.getAttribute("content") ?? "{}";
    const j = JSON.parse(raw) as Record<string, unknown>;
    const host = (v: unknown) => (typeof v === "string" && /^[a-z0-9.-]+(:\d+)?$/i.test(v) ? v.toLowerCase() : undefined);
    cached = { marketing: host(j.marketing), docs: host(j.docs) };
  } catch {
    cached = {};
  }
  return cached;
}
/** For tests. */
export function setHosts(h: Hosts | null) {
  cached = h;
}

const here = () => (typeof window === "undefined" ? "" : window.location.host.toLowerCase());
export const onDocsHost = () => !!hosts().docs && here() === hosts().docs;

const isDocsPath = (p: string) => /^\/(docs|topics)(\/|$)/.test(p);
/** "/docs/x" or "/topics/x" → the slug part ("" for the index). */
const docsRest = (p: string) => p.replace(/^\/(docs|topics)\/?/, "");

/** The URL for an app path, given the host map and the current host. External and non-path hrefs pass through. */
export function resolveHref(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const h = hosts();
  const [path, hash = ""] = href.split("#");
  const frag = hash ? `#${hash}` : "";
  if (isDocsPath(path)) {
    const rest = docsRest(path);
    if (h.docs) {
      const local = `/topics${rest ? `/${rest}` : ""}${frag}`;
      return here() === h.docs ? local : `https://${h.docs}${local}`;
    }
    return `/docs${rest ? `/${rest}` : ""}${frag}`;
  }
  // Everything else is a marketing-site page (or a bridge page like /manage, served on every host).
  if (onDocsHost() && h.marketing) return `https://${h.marketing}${href}`;
  return href;
}

export const isExternal = (href: string) => /^(https?:|mailto:)/.test(href);
