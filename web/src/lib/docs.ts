import docs from "virtual:docs";
import { DOC_ORDER, DOCS_NAV } from "../content/docs-nav";
import type { Doc } from "./docsBuild";

export type { Doc };
const bySlug = new Map(docs.map((d) => [d.slug, d]));
export const getDoc = (slug: string) => bySlug.get(slug);
export const allDocs = (): Doc[] => DOC_ORDER.map((s) => bySlug.get(s)).filter((d): d is Doc => !!d);
export const sections = () => DOCS_NAV.map((s) => ({ title: s.title, docs: s.slugs.map((x) => bySlug.get(x)).filter((d): d is Doc => !!d) }));
export function neighbours(slug: string) {
  const i = DOC_ORDER.indexOf(slug);
  return { prev: i > 0 ? bySlug.get(DOC_ORDER[i - 1]) : undefined, next: i >= 0 && i < DOC_ORDER.length - 1 ? bySlug.get(DOC_ORDER[i + 1]) : undefined };
}

export interface Hit {
  doc: Doc;
  heading?: { id: string; text: string };
  snippet: string;
  score: number;
}

/** A small client-side search over titles, headings and text (index built at compile time; no external service). */
export function search(query: string, limit = 8): Hit[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const hits: Hit[] = [];
  for (const doc of allDocs()) {
    const title = doc.title.toLowerCase();
    const text = doc.text.toLowerCase();
    let score = 0;
    let heading: Hit["heading"];
    for (const t of terms) {
      if (title.includes(t)) score += 10;
      const h = doc.headings.find((x) => x.text.toLowerCase().includes(t));
      if (h) {
        score += 5;
        heading ??= h;
      }
      const n = text.split(t).length - 1;
      if (!n && !title.includes(t) && !h) {
        score = 0;
        break; // every term must appear somewhere
      }
      score += Math.min(n, 5);
    }
    if (score <= 0) continue;
    // The whole query as a phrase counts most: in the title, then a heading, then the text.
    const phrase = terms.join(" ");
    if (terms.length > 1) {
      const ph = doc.headings.find((x) => x.text.toLowerCase().includes(phrase));
      if (title.includes(phrase)) score += 25;
      if (ph) {
        score += 20;
        heading = ph;
      }
      if (text.includes(phrase)) score += 8;
    }
    const at = terms.length > 1 && text.includes(terms.join(" ")) ? text.indexOf(terms.join(" ")) : text.indexOf(terms[0]);
    const start = Math.max(0, at - 50);
    const snippet = at < 0 ? doc.description : `${start > 0 ? "…" : ""}${doc.text.slice(start, start + 140)}…`;
    hits.push({ doc, heading, snippet, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
