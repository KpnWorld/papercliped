import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { isExternal, resolveHref } from "../lib/hosts";

/** Paths the React app renders itself; other same-site paths (like /manage) are bridge pages and need a full load. */
export const APP_PATH = /^\/(docs(\/|$)|topics(\/|$)|changelog$|community$|brand$|status$|privacy$|terms$|kit$|$)/;

/**
 * A link that goes to the right host: client-side navigation when the page is in this app on this host, a normal link
 * otherwise (other host, bridge page, external site).
 */
export function AppLink({ to, children, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const href = resolveHref(to);
  if (isExternal(href) || !APP_PATH.test(href.split("#")[0])) return <a href={href} rel={isExternal(href) ? "noopener noreferrer" : undefined} {...rest}>{children}</a>;
  return <Link to={href} {...rest}>{children}</Link>;
}
