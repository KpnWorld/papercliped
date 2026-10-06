/** The docs table of contents. Every page in site/docs/*.md must be listed exactly once (test/docs.test.ts checks). */
export const DOCS_NAV: { title: string; slugs: string[] }[] = [
  { title: "Get started", slugs: ["what-is-papercliped", "getting-started", "signup", "connect-your-paperclip"] },
  { title: "Connect your AI app", slugs: ["other-ai-apps", "chatgpt"] },
  { title: "Guides", slugs: ["permissions", "manage", "paperclip-plugin", "anonymous-mode", "self-hosting"] },
  { title: "Reference", slugs: ["tools", "manage-api", "public-api", "environment", "cli", "limits-and-errors", "security"] },
  { title: "Help", slugs: ["faq", "troubleshooting"] },
];

export const DOC_ORDER = DOCS_NAV.flatMap((s) => s.slugs);
export const sectionOf = (slug: string) => DOCS_NAV.find((s) => s.slugs.includes(slug))?.title ?? "Docs";
/** Where "Edit on GitHub" goes: the generated tools page is edited in the code, not the Markdown. */
export const editUrl = (slug: string) => (slug === "tools" ? "https://github.com/OpenSourcx/papercliped/blob/main/src/tools.ts" : `https://github.com/OpenSourcx/papercliped/edit/main/site/docs/${slug}.md`);
