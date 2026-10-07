import { pluginManifestV1Schema } from "@paperclipai/shared";
import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";

// Paperclip refuses to install a plugin whose manifest fails its own schema, with a 400 that says nothing useful to the
// person installing. This runs the same schema Paperclip runs, so a manifest it would reject fails here instead.
describe("manifest", () => {
  it("passes Paperclip's own manifest schema", () => {
    const r = pluginManifestV1Schema.safeParse(manifest);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
  });

  it("gives only page slots a route (the sidebar link goes through the host's navigation)", () => {
    for (const s of manifest.ui?.slots ?? []) if (s.type !== "page") expect(s.routePath, s.id).toBeUndefined();
    expect((manifest.ui?.slots ?? []).filter((s) => s.type === "page").map((s) => s.routePath)).toEqual(["papercliped"]);
  });
});
