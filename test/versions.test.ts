import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(read(p));

// One tag publishes both npm packages (see .github/workflows/release.yml), so every version string must agree.
describe("release metadata", () => {
  const root = json("package.json");
  it("every package and manifest carries the same version", () => {
    expect(json("plugin/package.json").version).toBe(root.version);
    expect(json(".claude-plugin/plugin.json").version).toBe(root.version);
    expect(/version: "([^"]+)"/.exec(read("plugin/src/manifest.ts"))![1]).toBe(root.version);
  });
  it("the changelog has a section for this version", () => {
    expect(read("CHANGELOG.md")).toMatch(new RegExp(`^## v${root.version.replace(/\./g, "\\.")}\\b`, "m"));
  });
  it("npm trusted publishing requirements hold for both packages", () => {
    for (const p of [root, json("plugin/package.json")]) {
      expect(p.repository.url).toBe("git+https://github.com/OpenSourcx/papercliped.git");
      expect(p.publishConfig ?? { access: "public" }).toEqual({ access: "public" });
      expect(p.private).not.toBe(true);
    }
    expect(json("plugin/package.json").repository.directory).toBe("plugin");
  });
});
