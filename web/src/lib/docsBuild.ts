// Runs at build time (in the Vite plugin, under Node): turns site/docs/*.md into the data the docs app renders.
import { renderMarkdown } from "../../../src/site/markdown";

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}
export interface Doc {
  slug: string;
  title: string;
  description: string;
  html: string; // rendered body, without the H1
  headings: DocHeading[];
  text: string; // plain text, for search
  updated: string | null; // YYYY-MM-DD from git, null when unknown
}

const SITE = { url: "https://papercliped.co", contact: "support@papercliped.co", effective: "2026-10-06" };
const fill = (md: string) => md.replace(/\{\{URL\}\}/g, SITE.url).replace(/\{\{CONTACT\}\}/g, SITE.contact).replace(/\{\{DATE\}\}/g, SITE.effective);
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";

export function buildDoc(slug: string, md: string, updated: string | null): Doc {
  let html = renderMarkdown(fill(md));
  let title = slug;
  html = html.replace(/<h1[^>]*>(.*?)<\/h1>\s*/, (_m, t) => {
    title = strip(t);
    return "";
  });
  const headings: DocHeading[] = [];
  const used = new Set<string>();
  // Keep the renderer's own ids when it sets them, so anchors are the same on the bridge's pages and here.
  html = html.replace(/<h([23])(?: id="([^"]*)")?>(.*?)<\/h\1>/g, (_m, level, given, inner) => {
    const text = strip(inner);
    const base = given || slugify(text);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    headings.push({ id, text, level: Number(level) as 2 | 3 });
    return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${level}>`;
  });
  const first = /<p>(.*?)<\/p>/.exec(html);
  const description = first ? strip(first[1]).slice(0, 180) : "";
  return { slug, title, description, html, headings, text: strip(html).replace(/\s+/g, " ").trim(), updated };
}
