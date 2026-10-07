import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { surfaceOfTool } from "../src/access/policy.js";
import { requiredScope } from "../src/oauth/scopes.js";
import { tools } from "../src/tools.js";

// The website lists every tool and the level it needs; regenerate with `npm run build && node scripts/gen-web-data.mjs`.
describe("website data", () => {
  it("web/src/generated/tools.json matches the tool catalogue", () => {
    const want = tools.map((t) => ({ name: t.name, title: t.title, description: t.description, access: t.access, scope: requiredScope(t, {}), surface: surfaceOfTool(t) }));
    expect(JSON.parse(readFileSync(new URL("../web/src/generated/tools.json", import.meta.url), "utf8"))).toEqual(want);
  });
  it("site/docs/tools.md lists every tool", () => {
    const md = readFileSync(new URL("../site/docs/tools.md", import.meta.url), "utf8");
    for (const t of tools) expect(md, t.name).toContain(`\`${t.name}\``);
    expect(md).toContain(`${tools.length} tools in total`);
  });
});
