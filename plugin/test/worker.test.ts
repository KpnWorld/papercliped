import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

afterEach(() => vi.unstubAllGlobals());

describe("manifest", () => {
  it("declares only what the plugin uses", () => {
    expect(manifest).toMatchObject({ apiVersion: 1, categories: ["connector", "ui"], entrypoints: { worker: "dist/worker.js", ui: "dist/ui" } });
    expect([...manifest.capabilities].sort()).toEqual(["http.outbound", "plugin.state.read", "plugin.state.write", "ui.page.register", "ui.sidebar.register"]);
    expect(manifest.ui!.slots!.map((s) => s.type).sort()).toEqual(["page", "sidebar"]);
    expect((manifest.instanceConfigSchema as any).properties.bridgeUrl.default).toBe("https://papercliped.kpnsolute.com");
  });
});

describe("worker wiring (SDK test harness)", () => {
  async function boot(config: Record<string, unknown> = {}) {
    const harness = createTestHarness({ manifest, config });
    await plugin.definition.setup(harness.ctx);
    return harness;
  }

  it("registers per-user actions and uses the host-verified actor for state", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const auth = (init.headers as Record<string, string>)?.authorization ?? null;
      calls.push({ url, auth });
      const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
      if (url.endsWith("/plugin-link/exchange")) return j({ token: "pcb_pl_abc123" });
      if (url.endsWith("/me")) return j({ name: "ann.test1", anonymous: false, alias: null, beta: true, paperclip: null, connected: true });
      return j({ error: "nope" }, 404);
    });
    const h = await boot({ bridgeUrl: "https://bridge.example.test" });
    const ann = { type: "user" as const, userId: "user-ann" };
    expect(await h.performAction("status", {}, { actor: ann })).toEqual({ linked: false });
    const linked: any = await h.performAction("link", { code: "pcl_AAAAA-BBBBB", userId: "user-evil" }, { actor: ann });
    expect(linked.linked).toBe(true);
    expect(JSON.stringify(linked)).not.toContain("pcb_pl_");
    expect(await h.performAction("status", {}, { actor: { type: "user", userId: "user-bob" } })).toEqual({ linked: false });
    expect(calls.some((c) => c.auth === "Bearer pcb_pl_abc123")).toBe(true);
    expect(calls.every((c) => c.url.startsWith("https://bridge.example.test/api/manage"))).toBe(true);
    await expect(h.performAction("status", {}, { actor: { type: "agent", userId: null } })).rejects.toThrow(/as a person/);
  });

  it("refuses to talk to a non-https bridge", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const h = await boot({ bridgeUrl: "http://bridge.example.test" });
    await expect(h.performAction("link", { code: "pcl_AAAAA-BBBBB" }, { actor: { type: "user", userId: "u" } })).rejects.toThrow(/https/);
    expect(f).not.toHaveBeenCalled();
  });
});
