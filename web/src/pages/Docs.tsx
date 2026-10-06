import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { cx } from "../components/cx";
import { SearchButton } from "../components/Search";
import { Card } from "../components/ui";
import { editUrl, sectionOf } from "../content/docs-nav";
import { getDoc, neighbours, sections, type Doc } from "../lib/docs";
import { NotFound } from "./Placeholder";
import { usePageTitle } from "./usePageTitle";

/** Routes the React app serves; other same-site links (like /manage) are left to the browser. */
const APP_PATH = /^\/(docs(\/|$)|changelog$|community$|brand$|status$|privacy$|terms$|$)/;

function Sidebar({ current, onNavigate }: { current?: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Docs" className="text-sm">
      {sections().map((s) => (
        <details key={s.title} open className="group mb-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-1.5 font-bold hover:bg-surface">
            <span>{s.title}</span>
            <span className="flex items-center gap-2 text-xs font-medium text-muted">
              <span className="rounded-full border border-line px-1.5">{s.docs.length}</span>
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
            </span>
          </summary>
          <ul className="mt-1 border-l border-line pl-2">
            {s.docs.map((d) => (
              <li key={d.slug}>
                <NavLink to={`/docs/${d.slug}`} onClick={onNavigate} aria-current={current === d.slug ? "page" : undefined}
                  className={cx("block rounded-md px-2 py-1 transition-colors", current === d.slug ? "bg-accent font-semibold text-accent-ink" : "text-muted hover:bg-surface hover:text-ink")}>
                  {d.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </nav>
  );
}

/** "On this page", highlighting the section in view. */
function Toc({ doc }: { doc: Doc }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = doc.headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-80px 0px -70% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [doc]);
  if (!doc.headings.length) return null;
  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-2 font-bold">On this page</p>
      <ul className="space-y-1 border-l border-line">
        {doc.headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className={cx("-ml-px block border-l-2 py-0.5 transition-colors", h.level === 3 ? "pl-6" : "pl-3", active === h.id ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}>{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="rounded-lg border border-field px-2.5 py-1 text-xs font-semibold transition-transform duration-150 hover:-translate-y-0.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href.split("#")[0]);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked: nothing to do */
        }
      }}>
      {done ? "Link copied" : "Copy link"}
    </button>
  );
}

function DocsShell({ current, children, aside }: { current?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="mx-auto max-w-7xl px-4">
      <div className="flex items-center gap-3 border-b border-line py-3 lg:hidden">
        <button type="button" aria-expanded={menu} aria-controls="docs-drawer" onClick={() => setMenu((m) => !m)} className="rounded-lg border border-field px-3 py-1.5 text-sm font-semibold">Topics</button>
        <SearchButton className="flex-1" />
      </div>
      {menu && <div id="docs-drawer" className="border-b border-line py-4 lg:hidden"><Sidebar current={current} onNavigate={() => setMenu(false)} /></div>}
      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_13rem]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto py-8 pr-2">
            <SearchButton className="mb-5 w-full" />
            <Sidebar current={current} />
          </div>
        </aside>
        <div className="min-w-0 py-8">{children}</div>
        {aside && <aside className="hidden xl:block"><div className="sticky top-20 py-8">{aside}</div></aside>}
      </div>
    </div>
  );
}

export function DocsIndex() {
  usePageTitle("Docs");
  return (
    <DocsShell>
      <h1 className="text-4xl font-bold sm:text-5xl">Docs</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">Connect your AI app to Paperclip, choose what it may do, and run Papercliped yourself. Press <kbd className="rounded border border-field px-1.5 text-sm">Ctrl K</kbd> to search.</p>
      {sections().map((s) => (
        <section key={s.title} aria-labelledby={`sec-${s.title}`} className="mt-10">
          <h2 id={`sec-${s.title}`} className="text-2xl font-bold">{s.title} <span className="text-base font-medium text-muted">({s.docs.length})</span></h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {s.docs.map((d) => (
              <Card as="li" interactive key={d.slug} className="p-0">
                <Link to={`/docs/${d.slug}`} className="block rounded-2xl p-4">
                  <span className="font-semibold">{d.title}</span>
                  <span className="mt-1 line-clamp-2 block text-sm text-muted">{d.description}</span>
                </Link>
              </Card>
            ))}
          </ul>
        </section>
      ))}
    </DocsShell>
  );
}

export function DocPage() {
  const { slug = "" } = useParams();
  const doc = getDoc(slug);
  const nav = useNavigate();
  const loc = useLocation();
  const body = useRef<HTMLDivElement>(null);
  usePageTitle(doc ? doc.title : "Not found");

  // Scroll to the heading in the URL, or to the top on a new page.
  useEffect(() => {
    if (!doc) return;
    const id = decodeURIComponent(loc.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
    else window.scrollTo?.(0, 0);
  }, [doc, loc.hash]);

  // Copy buttons on code blocks.
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    for (const pre of Array.from(root.querySelectorAll("pre"))) {
      if (pre.querySelector("button")) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Copy";
      b.className = "copy-code";
      b.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? pre.textContent ?? "");
          b.textContent = "Copied";
        } catch {
          b.textContent = "Select & copy";
        }
        setTimeout(() => (b.textContent = "Copy"), 1600);
      });
      pre.appendChild(b);
    }
  }, [doc]);

  if (!doc) return <NotFound />;
  const { prev, next } = neighbours(doc.slug);
  // In-app links navigate without a reload; everything else behaves normally.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    if (href.startsWith("#")) return;
    const path = href.split("#")[0];
    if (href.startsWith("/") && APP_PATH.test(path)) {
      e.preventDefault();
      nav(href);
    }
  };
  return (
    <DocsShell current={doc.slug} aside={<Toc doc={doc} />}>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link to="/docs" className="hover:text-ink">Docs</Link></li>
          <li aria-hidden="true">›</li>
          <li>{sectionOf(doc.slug)}</li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="text-ink">{doc.title}</li>
        </ol>
      </nav>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-4xl font-bold">{doc.title}</h1>
        <CopyLink />
      </div>
      {doc.updated && <p className="mt-1 text-sm text-muted">Last updated <time dateTime={doc.updated}>{new Date(`${doc.updated}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time></p>}
      {doc.headings.length > 2 && (
        <details className="mt-4 rounded-xl border border-line p-3 xl:hidden">
          <summary className="cursor-pointer font-semibold">On this page</summary>
          <div className="mt-2"><Toc doc={doc} /></div>
        </details>
      )}
      <div ref={body} onClick={onClick} className="prose-papercliped docs-body mt-6" dangerouslySetInnerHTML={{ __html: doc.html }} />
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm">
        <a href={editUrl(doc.slug)} rel="noopener noreferrer" className="text-link underline">Edit this page on GitHub</a>
        <span className="text-muted">Something wrong? <Link to="/community" className="text-link underline">Tell us</Link></span>
      </div>
      <nav aria-label="Previous and next" className="mt-6 grid gap-3 sm:grid-cols-2">
        {prev ? <Link to={`/docs/${prev.slug}`} className="rounded-2xl border border-line p-4 transition-transform duration-150 hover:-translate-y-0.5"><span className="text-xs text-muted">← Previous</span><span className="block font-semibold">{prev.title}</span></Link> : <span />}
        {next && <Link to={`/docs/${next.slug}`} className="rounded-2xl border border-line p-4 text-right transition-transform duration-150 hover:-translate-y-0.5"><span className="text-xs text-muted">Next →</span><span className="block font-semibold">{next.title}</span></Link>}
      </nav>
    </DocsShell>
  );
}
