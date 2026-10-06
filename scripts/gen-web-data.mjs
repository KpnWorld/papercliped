// Writes data the website shows, generated from the real code so it can't drift: the tool catalogue with the scope each tool
// needs. Run after `npm run build`:  node scripts/gen-web-data.mjs   (test/web-data.test.ts fails if the file is stale)
import { writeFileSync } from "node:fs";
import { requiredScope } from "../dist/oauth/scopes.js";
import { tools } from "../dist/tools.js";

export function toolData(list = tools, scopeOf = requiredScope) {
  return list.map((t) => ({ name: t.name, title: t.title, description: t.description, access: t.access, scope: scopeOf(t, {}) }));
}

const out = new URL("../web/src/generated/tools.json", import.meta.url);
writeFileSync(out, JSON.stringify(toolData(), null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
