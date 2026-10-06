// The bridge's own Markdown renderer (HTML-escaped first; only a fixed set of tags; safe links), shared with the website.
export { renderMarkdown } from "../../../src/site/markdown";

/** Fill the placeholders the bridge fills for the legal pages. */
export const SITE = { url: "https://papercliped.co", contact: "support@papercliped.co", effective: "2026-10-06" };
export const fill = (md: string) => md.replace(/\{\{URL\}\}/g, SITE.url).replace(/\{\{CONTACT\}\}/g, SITE.contact).replace(/\{\{DATE\}\}/g, SITE.effective);
