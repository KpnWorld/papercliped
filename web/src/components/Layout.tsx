import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppLink } from "./AppLink";
import { community, liveSocials, REPO_URL } from "../config/community";
import { cx } from "./cx";
import { Mascot } from "./Mascot";
import { SearchButton, SearchHost } from "./Search";
import { ThemePicker } from "./ThemePicker";
import { compact, useRepoStars } from "../lib/useRepo";
import { Badge } from "./ui";

export function Wordmark({ className }: { className?: string }) {
  return (
    <AppLink to="/" className={cx("flex items-center gap-2 rounded-lg", className)} aria-label="papercliped home">
      <Mascot size={30} interactive={false} title="" />
      <span className="font-display text-xl font-bold lowercase tracking-tight">papercliped</span>
    </AppLink>
  );
}

type MenuItem = { to: string; title: string; desc: string; badge?: string };
export const MENUS: { label: string; items: MenuItem[] }[] = [
  {
    label: "Learn",
    items: [
      { to: "/docs", title: "Docs", desc: "Quickstart, guides and reference." },
      { to: "/docs/connect-your-paperclip", title: "Set up your Paperclip", desc: "Get a public address, with or without a domain." },
      { to: "/docs/paperclip-plugin", title: "Paperclip plugin", desc: "Manage connections from inside Paperclip.", badge: "New" },
      { to: "/changelog", title: "Changelog", desc: "Everything that shipped, newest first." },
    ],
  },
  {
    label: "Explore",
    items: [
      { to: "/community", title: "Community", desc: "Join in, suggest features, report bugs." },
      { to: "/brand", title: "Brand assets", desc: "The wordmark, the mascot and how to use them." },
      { to: REPO_URL, title: "Source code", desc: "MIT licensed, on GitHub." },
      { to: "/status", title: "Status", desc: "Live, public numbers for the hosted service.", badge: "New" },
    ],
  },
];

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);
  const id = `menu-${label.toLowerCase()}`;
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface">
        {label} <span aria-hidden="true" className={cx("transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <div id={id} className="absolute left-0 top-full z-40 mt-2 w-80 rounded-xl border border-line bg-bg p-2 shadow-xl">
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
  const inner = (
    <>
      <span className="flex items-center gap-2 font-semibold">{item.title}{item.badge && <Badge>{item.badge}</Badge>}</span>
      <span className="block text-sm text-muted">{item.desc}</span>
    </>
  );
  return <AppLink to={item.to} className="block rounded-lg px-3 py-2 hover:bg-surface">{inner}</AppLink>;
}

/** GitHub link with the live star count (served by the bridge; no request to GitHub from the browser). */
export function GitHubButton() {
  const stars = useRepoStars();
  return (
    <a href={REPO_URL} rel="noopener noreferrer" aria-label={stars == null ? "Star Papercliped on GitHub" : `Star Papercliped on GitHub, ${stars} stars`}
      className="inline-flex h-9 items-stretch overflow-hidden rounded-lg border border-field text-sm font-medium transition-transform duration-150 hover:-translate-y-0.5">
      <span className="flex items-center gap-2 px-3 hover:bg-surface"><GitHubIcon /> Star</span>
      <span className="flex items-center gap-1 border-l border-field bg-surface px-2.5 tabular-nums" aria-hidden="true">
        <span>★</span>{stars == null ? "—" : compact(stars)}
      </span>
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

export function Header() {
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  const inDocs = /^\/(docs|topics)(\/|$)/.test(loc.pathname);
  useEffect(() => setMobile(false), [loc.pathname]);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {MENUS.map((m) => <Menu key={m.label} {...m} />)}
          <AppLink to="/community" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface">Community</AppLink>
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          {!inDocs && <SearchButton className="hidden w-52 lg:flex" />}
          <ThemePicker compact />
          <GitHubButton />
        </div>
        <button type="button" className="ml-auto rounded-lg border border-field px-3 py-1.5 text-sm md:hidden" aria-expanded={mobile} aria-controls="mobile-nav" onClick={() => setMobile((m) => !m)}>
          Menu
        </button>
      </div>
      {mobile && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line px-4 pb-4 md:hidden">
          {MENUS.map((m) => (
            <div key={m.label} className="pt-3">
              <p className="px-3 text-xs font-bold uppercase tracking-wide text-muted">{m.label}</p>
              <ul>{m.items.map((it) => <li key={it.title}><NavItem item={it} /></li>)}</ul>
            </div>
          ))}
          <div className="mt-3 px-3"><ThemePicker /></div>
        </nav>
      )}
    </header>
  );
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
