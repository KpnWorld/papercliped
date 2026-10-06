import { useMemo, useState } from "react";
import md from "../../../CHANGELOG.md?raw";
import dates from "../content/release-dates.json";
import { cx } from "../components/cx";
import { Badge, TextLink } from "../components/ui";
import { parseChangelog, type Kind } from "../lib/changelog";
import { renderMarkdown } from "../lib/markdown";
import { usePageTitle } from "./usePageTitle";

const KIND: Record<Kind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const inline = (s: string) => renderMarkdown(s).replace(/^<p>|<\/p>$/g, "");

/** Every release from CHANGELOG.md, newest first, with filters and an Atom feed. */
export function Changelog() {
  usePageTitle("Changelog");
  const releases = useMemo(() => parseChangelog(md, dates as Record<string, string>), []);
  const [filter, setFilter] = useState<Kind | "all">("all");
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <h1 className="text-4xl font-bold sm:text-5xl">Changelog</h1>
      <p className="mt-3 text-lg text-muted">Everything that shipped, newest first. Subscribe with the <a className="text-link underline" href="/changelog.xml">Atom feed</a>, or watch releases on <TextLink to="https://github.com/OpenSourcx/papercliped/releases">GitHub</TextLink>.</p>
      <div role="group" aria-label="Filter changes" className="mt-6 flex flex-wrap gap-2">
        {(["all", "new", "improved", "fixed"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={cx("rounded-full border px-3 py-1 text-sm font-medium transition-all duration-150 hover:-translate-y-0.5", filter === k ? "border-accent bg-accent text-accent-ink" : "border-field")}>
            {k === "all" ? "Everything" : KIND[k]}
          </button>
        ))}
      </div>
      <ol className="relative mt-10 border-l-2 border-line pl-6 sm:pl-8">
        {releases.map((r) => {
          const entries = r.entries.filter((e) => filter === "all" || e.kind === filter);
          if (filter !== "all" && !entries.length) return null;
          return (
            <li key={r.version} id={r.anchor} className="relative mb-12 scroll-mt-24">
              <span aria-hidden="true" className={cx("absolute -left-[33px] top-1.5 h-4 w-4 rounded-full border-2 border-accent sm:-left-[41px]", r.unreleased ? "bg-bg" : "bg-accent")} />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-2xl font-bold"><a href={`#${r.anchor}`} className="hover:underline">{r.unreleased ? "In progress" : r.version}</a></h2>
                {r.unreleased ? <Badge tone="outline">Unreleased</Badge> : r.date ? <time dateTime={r.date} className="text-sm text-muted">{fmt(r.date)}</time> : <span className="text-sm text-muted">date not recorded</span>}
              </div>
              {r.title && <p className="mt-1 font-semibold">{r.title}</p>}
              {filter === "all" && r.intro.map((p, i) => <p key={i} className="prose-papercliped mt-2 text-muted" dangerouslySetInnerHTML={{ __html: inline(p) }} />)}
              <ul className="mt-3 space-y-3">
                {entries.map((e, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={cx("mt-0.5 h-fit shrink-0 rounded-md px-2 py-0.5 text-xs font-bold uppercase", e.kind === "new" ? "bg-accent text-accent-ink" : "border border-field")}>{KIND[e.kind]}</span>
                    <span className="prose-papercliped min-w-0" dangerouslySetInnerHTML={{ __html: inline(e.text) }} />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
