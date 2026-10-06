import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BridgeError, normalizeBridgeUrl } from "../src/bridge.js";
import { createHandlers } from "../src/handlers.js";
import { linkScope } from "../src/keys.js";
import { newCode, startFakeBridge, type FakeBridge } from "./fake-bridge.js";

let fake: FakeBridge;
const mem = new Map<string, unknown>();
const k = (s: ReturnType<typeof linkScope>) => `${s.scopeKind}|${s.namespace}|${s.stateKey}`;
const state = { get: async (s: any) => mem.get(k(s)) ?? null, set: async (s: any, v: unknown) => void mem.set(k(s), v), delete: async (s: any) => void mem.delete(k(s)) };
const ann = { type: "user", userId: "user-ann" };
const bob = { type: "user", userId: "user-bob" };
let h: ReturnType<typeof createHandlers>;

beforeAll(async () => {
  fake = await startFakeBridge();
  h = createHandlers({ state, fetch: (u, i) => fetch(u, i), bridgeUrl: async () => fake.url, allowInsecureLoopback: true });
});
afterAll(() => fake.server.close());

describe("bridge url", () => {
  it("defaults to the hosted bridge and insists on https", () => {
    expect(normalizeBridgeUrl(undefined)).toBe("https://papercliped.co");
    expect(normalizeBridgeUrl("https://bridge.example.com/")).toBe("https://bridge.example.com");
    for (const bad of ["http://bridge.example.com", "http://127.0.0.1:3000", "ftp://x.test", "https://u:p@x.test", "https://x.test/?a=1", "nonsense"]) expect(() => normalizeBridgeUrl(bad), bad).toThrow();
    expect(normalizeBridgeUrl("http://127.0.0.1:3000", { allowInsecureLoopback: true })).toBe("http://127.0.0.1:3000");
    expect(() => normalizeBridgeUrl("http://evil.example", { allowInsecureLoopback: true })).toThrow();
  });
});

describe("plugin actions against a fake bridge", () => {
  it("only acts for a verified person", async () => {
    await expect(h.status({}, { type: "agent", userId: null })).rejects.toThrow(/as a person/);
    await expect(h.link({ code: "x" }, { type: "user", userId: null })).rejects.toThrow(/as a person/);
  });

  it("links with a one-time code, stores the token under the actor's own key, and never returns it", async () => {
    expect(await h.status({}, ann)).toEqual({ linked: false });
    const code = newCode(fake);
    const r = await h.link({ code, instanceHost: "paperclip.example.com" }, ann);
    expect(r).toMatchObject({ linked: true, me: { name: "ann.test1" } });
    expect(JSON.stringify(r)).not.toContain("pcb_pl_");
    const stored: any = mem.get(k(linkScope("user-ann")));
    expect(stored.token).toMatch(/^pcb_pl_/);
    expect(mem.get(k(linkScope("user-bob")))).toBeUndefined();
    const ex = fake.seen.find((s) => s.path.endsWith("/plugin-link/exchange"))!;
    expect(ex.body).toEqual({ code, instanceHost: "paperclip.example.com", paperclipUserId: "user-ann" }); // the verified id, not a UI value
    expect(ex.headers["x-papercliped"]).toBe("1");
    expect(JSON.stringify(await h.status({}, ann))).not.toContain("pcb_pl_");
    // a used code is refused with the bridge's message
    await expect(h.link({ code }, bob)).rejects.toThrow(/not valid/);
    await expect(h.link({ code: "  " }, bob)).rejects.toThrow(/Paste the code/);
  });

  it("users are isolated: another person is not linked and cannot use Ann's token", async () => {
    expect(await h.status({}, bob)).toEqual({ linked: false });
    await expect(h.connections({}, bob)).rejects.toThrow(/Link your Papercliped account/);
    // even a params-supplied id/token changes nothing
    await expect(h.connections({ userId: "user-ann", token: "x" }, bob)).rejects.toThrow();
  });

  it("lists, changes level, toggles privacy and disconnects with the bearer token", async () => {
    const list: any = await h.connections({}, ann);
    expect(list.connections[0]).toMatchObject({ id: "g1", app: "Claude", level: "paperclip:read" });
    await h.setLevel({ id: "g1", level: "control" }, ann);
    expect(fake.connections[0].level).toBe("paperclip:control");
    await expect(h.setLevel({ id: "g1", level: "admin" }, ann)).rejects.toThrow(/read or control/);
    await expect(h.setLevel({ id: "nope", level: "read" }, ann)).rejects.toThrow(/No such connection/);
    expect(await h.privacy({ anonymous: true }, ann)).toMatchObject({ anonymous: true, alias: "Ann02" });
    await expect(h.privacy({ anonymous: "yes" }, ann)).rejects.toThrow();
    await h.disconnect({ id: "g1" }, ann);
    expect(fake.connections).toEqual([]);
    const authed = fake.seen.filter((s) => s.headers.authorization);
    expect(authed.every((s) => /^Bearer pcb_pl_/.test(String(s.headers.authorization)))).toBe(true);
  });

  it("forgets the link when the bridge says the token is dead", async () => {
    const token = (mem.get(k(linkScope("user-ann"))) as any).token;
    fake.tokens.get(token)!.revoked = true; // e.g. unlinked at /manage, or the secret key was rotated
    expect(await h.status({}, ann)).toEqual({ linked: false, expired: true });
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();
  });

  it("unlink revokes at the bridge and clears local state, even if the bridge is unreachable", async () => {
    await h.link({ code: newCode(fake) }, ann);
    const token = (mem.get(k(linkScope("user-ann"))) as any).token;
    expect(await h.unlink({}, ann)).toEqual({ linked: false, revoked: true });
    expect(fake.tokens.get(token)!.revoked).toBe(true);
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();

    await h.link({ code: newCode(fake) }, ann);
    const down = createHandlers({ state, fetch: async () => { throw new Error("offline"); }, bridgeUrl: async () => fake.url, allowInsecureLoopback: true });
    expect(await down.unlink({}, ann)).toEqual({ linked: false, revoked: false });
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();
  });

  it("surfaces unreachable bridges without leaking the token", async () => {
    await h.link({ code: newCode(fake) }, ann);
    const down = createHandlers({ state, fetch: async () => { throw new Error("offline: Bearer pcb_pl_secret"); }, bridgeUrl: async () => fake.url, allowInsecureLoopback: true });
    const e = await down.connections({}, ann).catch((x) => x);
    expect(e).toBeInstanceOf(BridgeError);
    expect(e.message).toBe("Could not reach the Papercliped bridge.");
    expect(mem.get(k(linkScope("user-ann")))).toBeTruthy(); // a network error does not unlink
  });

  it("refuses a non-https bridge URL from config", async () => {
    const bad = createHandlers({ state, fetch: (u, i) => fetch(u, i), bridgeUrl: async () => fake.url }); // no loopback exemption: what the worker does
    await expect(bad.link({ code: newCode(fake) }, bob)).rejects.toThrow(/https/);
  });
});
