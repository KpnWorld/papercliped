import { describe, expect, it } from "vitest";
import { burnVerify, generateSecretKey, hashSecretKey, normalizeSecretKey, verifySecretKey } from "../src/accounts/secret.js";
import { USERNAME_MAX, USERNAME_MIN, usernameKey, validateUsername } from "../src/accounts/username.js";

describe("username rules", () => {
  const ok = ["og.kpnwrld", "kpn_wrld1", "OG.Kpnwrld", "my.cliped1", "abc123", "a.b.c.d", "user_name", "x1y2z3", "9lives", "kpnworld.dev", "ab#cdef", "a".repeat(USERNAME_MAX - 1) + "1"];
  it.each(ok)("accepts %j", (u) => expect(validateUsername(u)).toMatchObject({ ok: true, username: u, key: u.toLowerCase() }));

  const bad: [string, RegExp][] = [
    ["", /at least/],
    ["a1", /at least 6/],
    ["abc.1", /at least 6/], // 5 chars
    ["kpnwrld", /number or one of/], // long enough, but no number/symbol
    ["justletters", /number or one of/],
    ["has space1", /only letters/],
    ["bad%name1", /only letters/],
    ["bad^name1", /only letters/],
    ["bad&name1", /only letters/],
    ["bad*name1", /only letters/],
    ["dash-name1", /only letters/],
    ["émile.123", /only letters/],
    ["名前名前名前1", /only letters/],
    ["emoji😀123", /only letters/],
    [".leading1", /Start your username/],
    ["_leading1", /Start your username/],
    ["#hashtag1", /Start your username/],
    ["admin.01", /reserved/],
    ["root_1234", /reserved/],
    ["Papercliped1", /reserved/],
    ["cliped#1", /reserved/],
    ["a".repeat(USERNAME_MAX) + "1", /at most/],
    ["new\nline1", /only letters/],
    ["tab\tname1", /only letters/],
  ];
  it.each(bad)("rejects %j", (u, why) => {
    const r = validateUsername(u);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(why);
  });

  it("rejects non-strings", () => {
    for (const v of [null, undefined, 123, {}, []]) expect(validateUsername(v).ok).toBe(false);
  });
  it("trims surrounding whitespace (but not inner)", () => {
    expect(validateUsername("  og.kpnwrld  ")).toMatchObject({ ok: true, username: "og.kpnwrld" });
  });
  it("uniqueness key ignores case only", () => {
    expect(usernameKey("OG.KpnWrld")).toBe("og.kpnwrld");
    expect(usernameKey("og.kpnwrld")).not.toBe(usernameKey("og_kpnwrld"));
  });
  it("min length is the documented constant", () => {
    expect(validateUsername("a".repeat(USERNAME_MIN - 2) + "1.").ok).toBe(true);
    expect(validateUsername("a".repeat(USERNAME_MIN - 2) + "1").ok).toBe(false);
  });
});

describe("secret key", () => {
  it("is 160 bits, grouped, with a prefix, and unique", () => {
    const keys = new Set(Array.from({ length: 200 }, generateSecretKey));
    expect(keys.size).toBe(200);
    for (const k of keys) {
      expect(k).toMatch(/^pcs_([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(normalizeSecretKey(k)).toHaveLength(32);
    }
  });

  it("normalises how people actually type it", () => {
    const k = generateSecretKey();
    const n = normalizeSecretKey(k)!;
    expect(normalizeSecretKey(k.toLowerCase())).toBe(n);
    expect(normalizeSecretKey(k.replace(/-/g, " "))).toBe(n);
    expect(normalizeSecretKey(k.replace(/-/g, ""))).toBe(n);
    expect(normalizeSecretKey(`  ${k}  `)).toBe(n);
    expect(normalizeSecretKey(k.slice(4))).toBe(n); // prefix optional
    expect(normalizeSecretKey("0".repeat(32))).toBe(normalizeSecretKey("O".repeat(32))); // O→0
    expect(normalizeSecretKey("1".repeat(32))).toBe(normalizeSecretKey("I".repeat(32))); // I→1
    expect(normalizeSecretKey("1".repeat(32))).toBe(normalizeSecretKey("L".repeat(32))); // L→1
  });

  it("rejects malformed input", () => {
    for (const v of ["", "short", "x".repeat(40), null, undefined, 12345, "pcs_" + "U".repeat(32), "pcs_ABCD-EFGH"]) expect(normalizeSecretKey(v)).toBeNull();
  });

  it("hashes with a per-hash salt and verifies only the right key", async () => {
    const k = generateSecretKey();
    const h1 = await hashSecretKey(normalizeSecretKey(k)!);
    const h2 = await hashSecretKey(normalizeSecretKey(k)!);
    expect(h1).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(h1).not.toBe(h2); // salted
    expect(h1).not.toContain(normalizeSecretKey(k)!);
    expect(await verifySecretKey(k, h1)).toBe(true);
    expect(await verifySecretKey(k.toLowerCase().replace(/-/g, " "), h1)).toBe(true);
    expect(await verifySecretKey(generateSecretKey(), h1)).toBe(false);
    expect(await verifySecretKey("garbage", h1)).toBe(false);
    expect(await verifySecretKey(null, h1)).toBe(false);
    expect(await verifySecretKey(k, "not-a-hash")).toBe(false);
    expect(await verifySecretKey(k, "scrypt$x$y$z$a$b")).toBe(false);
  });

  it("burnVerify costs about as much as a real verify (no user-enumeration timing gap)", async () => {
    const k = generateSecretKey();
    const h = await hashSecretKey(normalizeSecretKey(k)!);
    await burnVerify("warm"); // build the dummy hash first
    const time = async (f: () => Promise<unknown>) => {
      const t = performance.now();
      await f();
      return performance.now() - t;
    };
    const real = await time(() => verifySecretKey(generateSecretKey(), h));
    const burn = await time(() => burnVerify(generateSecretKey()));
    expect(burn).toBeGreaterThan(real * 0.4);
    expect(burn).toBeLessThan(real * 2.5 + 30);
  });
});

import { ALIAS_RE, anonInstanceLabel, displayName, generateAlias, isAlias } from "../src/accounts/alias.js";

describe("anonymous aliases", () => {
  it("look like Ann02: a short first name plus two digits", () => {
    for (let i = 0; i < 2000; i++) expect(generateAlias()).toMatch(ALIAS_RE);
    expect(generateAlias(() => 0)).toBe("Abe00");
  });
  it("are always shorter than the minimum username, so an alias can never be a valid username", () => {
    for (let i = 0; i < 5000; i++) {
      const a = generateAlias();
      expect(a.length).toBeLessThan(USERNAME_MIN);
      expect(validateUsername(a).ok).toBe(false);
    }
  });
  it("no real username can look like an alias", () => {
    for (const u of ["og.kpnwrld", "ann02.x", "Ann.02", "kpn_wrld1"]) expect(isAlias(u)).toBe(false);
    expect(isAlias("Ann02")).toBe(true);
    expect(isAlias(null)).toBe(false);
  });
  it("have enough variety to hand out thousands", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(generateAlias());
    expect(seen.size).toBeGreaterThan(5000);
  });
  it("displayName shows the alias only when anonymous", () => {
    expect(displayName({ username: "og.kpnwrld", anonymous: false, alias: "Ann02" })).toBe("og.kpnwrld");
    expect(displayName({ username: "og.kpnwrld", anonymous: true, alias: "Ann02" })).toBe("Ann02");
    expect(displayName({ username: "og.kpnwrld", anonymous: true, alias: null })).toBe("og.kpnwrld"); // never blank
  });
  it("anonymous instance labels are stable per account, keyed, and reveal nothing about the host", () => {
    const a = anonInstanceLabel("k".repeat(40), "acct1");
    expect(a).toMatch(/^anon-[0-9a-f]{6}$/);
    expect(anonInstanceLabel("k".repeat(40), "acct1")).toBe(a);
    expect(anonInstanceLabel("k".repeat(40), "acct2")).not.toBe(a);
    expect(anonInstanceLabel("z".repeat(40), "acct1")).not.toBe(a);
  });
});
