import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(read(p));

// One version on main publishes both npm packages and tags the commit (see .github/workflows/release.yml), so every version string must agree.
describe("release metadata", () => {
  const root = json("package.json");
  it("every package and manifest carries the same version", () => {
    expect(json("plugin/package.json").version).toBe(root.version);
    expect(json(".claude-plugin/plugin.json").version).toBe(root.version);
    expect(/version: "([^"]+)"/.exec(read("plugin/src/manifest.ts"))![1]).toBe(root.version);
    expect(json(".codex-plugin/plugin.json").version).toBe(root.version);
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
  it("scripts/version.mjs covers every file that carries the version", () => {
    const cfg = json(".release.json");
    expect(cfg.versionFiles.map((f: { path: string }) => f.path).sort()).toEqual([".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "package.json", "plugin/package.json", "plugin/src/manifest.ts"]);
  });
});

describe("agent guidance and plugin marketplaces", () => {
  it("Claude and Codex get the same release skill and the same repo guide", () => {
    expect(read(".claude/skills/release/SKILL.md")).toBe(read(".agents/skills/release/SKILL.md"));
    expect(read("CLAUDE.md")).toBe(read("AGENTS.md"));
    expect(read(".agents/skills/release/SKILL.md")).toMatch(/^---\nname: release\ndescription: .+\n---\n/);
  });
  it("both marketplaces offer the plugin at the repo root, and it connects to the hosted server", () => {
    for (const m of [json(".claude-plugin/marketplace.json"), json(".agents/plugins/marketplace.json")]) {
      expect(m.name).toBe("papercliped");
      expect(m.plugins).toEqual([expect.objectContaining({ name: "papercliped", source: "./" })]);
    }
    expect(json(".codex-plugin/plugin.json")).toMatchObject({ name: "papercliped", skills: "./skills", mcpServers: "./.mcp.json" });
    expect(json(".mcp.json").mcpServers.paperclip).toEqual({ type: "http", url: "https://mcp.papercliped.co/mcp" });
  });
});
