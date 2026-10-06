// Writes data the website shows, generated from the real code so it can't drift: the tool catalogue with the scope each tool
// needs. Run after `npm run build`:  node scripts/gen-web-data.mjs   (test/web-data.test.ts fails if the file is stale)
import { writeFileSync } from "node:fs";
import { requiredScope } from "../dist/oauth/scopes.js";
import { tools } from "../dist/tools.js";

export function toolData(list = tools, scopeOf = requiredScope) {
  return list.map((t) => ({ name: t.name, title: t.title, description: t.description, access: t.access, scope: scopeOf(t, {}) }));
}

/** The tool reference page (site/docs/tools.md), served by the bridge and the docs site. */
export function toolsMarkdown(data = toolData()) {
  const groups = [["paperclip:read", "Read only"], ["paperclip:control", "Full control"]];
  const esc = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  let md = `# Tool reference\n\nEvery tool Papercliped gives your AI app, generated from the code (\`src/tools.ts\`). ${data.length} tools in total. There are two levels: **Read only** can use the read tools; **Full control** can use every tool.\n\nRaw API calls (\`paperclip_api_request\`) need Read only for GET and Full control for anything else.\n`;
  for (const [scope, title] of groups) {
    const rows = data.filter((t) => t.scope === scope);
    md += `\n## ${title} (${rows.length})\n\n| Tool | What it does | Changes anything? |\n| --- | --- | --- |\n`;
    for (const t of rows) md += `| **${esc(t.title)}** \`${t.name}\` | ${esc(t.description)} | ${t.access === "read" ? "No" : t.access === "destructive" ? "Yes, can't be undone" : "Yes"} |\n`;
  }
  return md + `\nSee [Permissions](/docs/permissions) for how levels work and how to change them.\n`;
}

const out = new URL("../web/src/generated/tools.json", import.meta.url);
writeFileSync(out, JSON.stringify(toolData(), null, 2) + "\n");
writeFileSync(new URL("../site/docs/tools.md", import.meta.url), toolsMarkdown());
console.log(`wrote ${out.pathname} and site/docs/tools.md`);
