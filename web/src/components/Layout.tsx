import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppLink } from "./AppLink";
import { community, liveSocials, REPO_URL } from "../config/community";
import { cx } from "./cx";
import { Mascot } from "./Mascot";
import { Icon } from "./Icons";
import { useDismiss } from "./useDismiss";
import { SearchButton, SearchHost, SearchIconButton } from "./Search";
import { onDocsHost } from "../lib/hosts";
import { compact, useRepoStars } from "../lib/useRepo";
import { Badge } from "./ui";

export function Wordmark({ className }: { className?: string }) {
  return (
    <AppLink to="/" className={cx("flex items-center gap-2 rounded-lg", className)} aria-label="papercliped home">
      <Mascot size={30} interactive={false} title="" />
      <span className="font-display text-xl font-bold lowercase tracking-tighter">papercliped</span>
    </AppLink>
  );
}

type MenuItem = { to: string; title: string; desc: string; badge?: string };
export const MENUS: { label: string; items: MenuItem[] }[] = [
  {
    label: "Product",
    items: [
      { to: "/", title: "Overview", desc: "What Papercliped does, in a minute." },
      { to: "/docs/getting-started", title: "Get started", desc: "Connect Claude or ChatGPT to your Paperclip." },
      { to: "/docs/paperclip-plugin", title: "Paperclip plugin", desc: "Manage connections from inside Paperclip.", badge: "New" },
      { to: "/status", title: "Status", desc: "Live, public numbers for the hosted service.", badge: "New" },
    ],
  },
  {
    label: "Resources",
    items: [
      { to: "/changelog", title: "Changelog", desc: "Everything that shipped, newest first." },
      { to: "/docs/connect-your-paperclip", title: "Set up your Paperclip", desc: "Get a public address, with or without a domain." },
      { to: "/brand", title: "Brand assets", desc: "The wordmark, the mascot and how to use them." },
      { to: REPO_URL, title: "Source code", desc: "MIT licensed, on GitHub." },
    ],
  },
];

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useDismiss(open, () => setOpen(false), box);
  const id = `menu-${label.toLowerCase()}`;
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className={cx("flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:text-ink", open ? "text-ink" : "text-muted")}>
        {label} <Icon name="down" size={14} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={id} className="animate-toast-in absolute left-1/2 top-full z-40 mt-3 w-80 -translate-x-1/2 rounded-2xl border border-line bg-bg p-2 shadow-2xl">
          <ul>
            {items.map((it) => (
              <li key={it.title}>
                <NavItem item={it} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NavItem({ item }: { item: MenuItem }) {
  return (
    <AppLink to={item.to} className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-surface">
      <span className="flex items-center gap-2 font-semibold">{item.title}{item.badge && <Badge>{item.badge}</Badge>}</span>
      <span className="block text-sm text-muted">{item.desc}</span>
    </AppLink>
  );
}

/** GitHub link with the live star count (served by the bridge; no request to GitHub from the browser). */
export function GitHubButton({ className }: { className?: string }) {
  const stars = useRepoStars();
  const shown = stars != null && stars > 0;
  return (
    <a href={REPO_URL} rel="noopener noreferrer" aria-label={shown ? `Star Papercliped on GitHub, ${stars} stars` : "Star Papercliped on GitHub"}
      className={cx("inline-flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-sm font-medium transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-field", className)}>
      <GitHubIcon /><span>Star</span>
      {shown && <span className="flex items-center gap-1 border-l border-line pl-2 tabular-nums text-muted" aria-hidden="true"><Icon name="star" size={13} />{compact(stars)}</span>}
    </a>
  );
}

export function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={size} height={size} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const SKIP = "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink";
const PILL_CTA = "inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.97]";

/** The marketing header: logo left, a short centred nav, search, stars and one call to action on the right. */
function SiteHeader() {
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  useEffect(() => setMobile(false), [loc.pathname]);
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <a href="#main" className={SKIP}>Skip to content</a>
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-[1fr_auto_1fr]">
        <Wordmark className="justify-self-start" />
        <nav aria-label="Main" className="hidden items-center md:flex">
          <Menu {...MENUS[0]} />
          <AppLink to="/docs" className="rounded-full px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-ink">Docs</AppLink>
          <Menu {...MENUS[1]} />
          <AppLink to="/community" className="rounded-full px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-ink">Community</AppLink>
        </nav>
        <div className="flex items-center justify-self-end gap-2">
          <SearchIconButton />
          <GitHubButton className="hidden lg:inline-flex" />
          <AppLink to="/docs/getting-started" className={cx(PILL_CTA, "hidden sm:inline-flex")}>Get started</AppLink>
          <button type="button" aria-label={mobile ? "Close menu" : "Open menu"} aria-expanded={mobile} aria-controls="mobile-nav" onClick={() => setMobile((m) => !m)}
            className="grid h-9 w-9 place-items-center rounded-full border border-line md:hidden">
            <Icon name={mobile ? "close" : "menu"} size={17} />
          </button>
        </div>
      </div>
      {mobile && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line px-4 pb-5 md:hidden">
          <ul className="pt-3">
            <li><AppLink to="/docs" className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-surface">Docs</AppLink></li>
            <li><AppLink to="/community" className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-surface">Community</AppLink></li>
          </ul>
          {MENUS.map((m) => (
            <div key={m.label} className="pt-3">
              <p className="px-3 text-xs font-bold uppercase tracking-widest text-muted">{m.label}</p>
              <ul>{m.items.map((it) => <li key={it.title}><NavItem item={it} /></li>)}</ul>
            </div>
          ))}
          <div className="mt-4 flex flex-wrap gap-2 px-3">
            <AppLink to="/docs/getting-started" className={PILL_CTA}>Get started</AppLink>
            <GitHubButton />
          </div>
        </nav>
      )}
    </header>
  );
}

const DOCS_LINKS = [
  { to: "/", label: "Home" },
  { to: "/docs", label: "Docs" },
  { to: "/changelog", label: "Changelog" },
  { to: REPO_URL, label: "GitHub" },
];

/** The docs header: links left, "papercliped Docs" centred, search and stars right. */
function DocsHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <a href="#main" className={SKIP}>Skip to content</a>
      <div className="mx-auto grid h-14 max-w-[90rem] grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-[1fr_auto_1fr]">
        <nav aria-label="Site" className="hidden items-center gap-1 text-sm md:flex">
          {DOCS_LINKS.map((l) => <AppLink key={l.label} to={l.to} className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface hover:text-ink">{l.label}</AppLink>)}
        </nav>
        <AppLink to="/docs" className="flex items-center gap-2 justify-self-start rounded-lg md:justify-self-center" aria-label="papercliped docs home">
          <Mascot size={26} interactive={false} title="" />
          <span className="font-display text-lg font-bold lowercase tracking-tight">papercliped</span>
          <span className="text-lg font-medium text-muted">Docs</span>
        </AppLink>
        <div className="flex items-center justify-self-end gap-2">
          <SearchButton label="Search" className="hidden w-56 sm:flex" />
          <SearchIconButton className="sm:hidden" />
          <GitHubButton className="hidden md:inline-flex" />
        </div>
      </div>
    </header>
  );
}

export const isDocsPath = (p: string) => /^\/(docs|changelog)(\/|$)/.test(p);

export function Header() {
  const loc = useLocation();
  return onDocsHost() || isDocsPath(loc.pathname) ? <DocsHeader /> : <SiteHeader />;
}

const FOOTER: { title: string; links: { to: string; label: string }[] }[] = [
  { title: "Product", links: [{ to: "/", label: "Overview" }, { to: "/docs/getting-started", label: "Get started" }, { to: "/docs/paperclip-plugin", label: "Paperclip plugin" }, { to: "/changelog", label: "Changelog" }] },
  { title: "Docs", links: [{ to: "/docs", label: "All topics" }, { to: "/docs/connect-your-paperclip", label: "Set up your Paperclip" }, { to: "/docs/other-ai-apps", label: "Any AI app (MCP)" }, { to: "/docs/troubleshooting", label: "Troubleshooting" }] },
  { title: "Community", links: [{ to: "/community", label: "Join the community" }, { to: community.newIssue, label: "Report a bug" }, { to: "/community#suggest", label: "Suggest a feature" }, { to: "/brand", label: "Brand assets" }] },
  { title: "Company", links: [{ to: REPO_URL, label: "Open source (MIT)" }, { to: `mailto:${community.email}`, label: "Contact" }, { to: "/status", label: "Status" }] },
  { title: "Legal", links: [{ to: "/privacy", label: "Privacy" }, { to: "/terms", label: "Terms" }, { to: "/docs/security", label: "Security" }] },
];

export function Footer() {
  const socials = liveSocials();
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-1">
          <Wordmark />
          <p className="mt-3 text-sm text-muted">Papercliped, not Paperclipped. Free and open source.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {socials.map((s) => (
              <a key={s.key} href={s.href} rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-lg border border-field px-3 text-sm hover:bg-surface">{s.label}</a>
            ))}
          </div>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <h2 className="font-sans text-sm font-bold">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  <AppLink to={l.to} className="text-muted hover:text-ink">{l.label}</AppLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted">
          <span>© {new Date().getUTCFullYear()} Papercliped contributors · MIT licence · Not affiliated with Paperclip</span>
          <span>No trackers. No third-party scripts.</span>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
      <SearchHost />
    </div>
  );
}
