import privacy from "../../../site/privacy.md?raw";
import terms from "../../../site/terms.md?raw";
import { fill, renderMarkdown } from "../lib/markdown";
import { usePageTitle } from "./usePageTitle";

const PAGES = { privacy: { title: "Privacy", md: privacy }, terms: { title: "Terms", md: terms } } as const;

/** The same Markdown the bridge serves, rendered with the same escaping renderer. */
export function Legal({ page }: { page: keyof typeof PAGES }) {
  const p = PAGES[page];
  usePageTitle(p.title);
  return <article className="prose-papercliped mx-auto max-w-3xl px-4 py-12 sm:py-16" dangerouslySetInnerHTML={{ __html: renderMarkdown(fill(p.md)) }} />;
}
