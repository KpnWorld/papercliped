import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer as httpsServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UnsafeUrlError, createSafeFetch, guardedLookup, isPublicAddress, parseInstanceUrl } from "../src/net/safe-fetch.js";

describe("isPublicAddress", () => {
  const priv = [
    "127.0.0.1", "127.255.255.254", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::1", "ff02::1", "2001:db8::1",
  ];
  const pub = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "11.0.0.1", "2606:4700:4700::1111", "2a00:1450:4001::200e"];
  it.each(priv)("rejects %s", (a) => expect(isPublicAddress(a)).toBe(false));
  it.each(pub)("accepts %s", (a) => expect(isPublicAddress(a)).toBe(true));
  it("rejects non-IP strings", () => expect(isPublicAddress("example.com")).toBe(false));
});

describe("parseInstanceUrl", () => {
  it("normalises good addresses to an origin", () => {
    expect(parseInstanceUrl("https://Paperclip.Example.com/some/path?x=1#f").href).toBe("https://paperclip.example.com/");
    expect(parseInstanceUrl("paperclip.example.com").origin).toBe("https://paperclip.example.com");
    expect(parseInstanceUrl("https://paperclip.example.com:443").origin).toBe("https://paperclip.example.com");
    expect(parseInstanceUrl("https://paperclip.example.com.").origin).toBe("https://paperclip.example.com");
    expect(parseInstanceUrl("https://p.example.com:8443", { allowedPorts: [443, 8443], denyHosts: [] }).origin).toBe("https://p.example.com:8443");
  });
  const bad = [
    "http://paperclip.example.com", "ftp://paperclip.example.com", "file:///etc/passwd", "javascript:alert(1)",
    "https://localhost", "https://LOCALHOST", "https://127.0.0.1", "https://127.1", "https://2130706433", "https://0x7f.0.0.1", "https://0177.0.0.1",
    "https://127。0。0。1", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://169.254.169.254", "https://10.0.0.5",
    "https://intranet", "https://printer.local", "https://db.internal", "https://x.localhost", "https://u:p@paperclip.example.com",
    "https://paperclip.example.com@evil.com", "https://paperclip.example.com:3100", "https://paperclip.example.com:22", "", "   ", "https://", "a".repeat(400),
  ];
  it.each(bad)("rejects %j", (u) => expect(() => parseInstanceUrl(u)).toThrow(UnsafeUrlError));
  it("honours the deny list (e.g. the bridge itself)", () => {
    expect(() => parseInstanceUrl("https://bridge.example.com", { allowedPorts: [443], denyHosts: ["Bridge.Example.com"] })).toThrow(/not allowed/);
  });
});

describe("connection-level guard", () => {
  it("refuses hostnames that resolve to loopback (no check-then-connect gap)", async () => {
    await expect(new Promise((res, rej) => guardedLookup("localhost", {}, (e, a) => (e ? rej(e) : res(a))))).rejects.toThrow(/non-public/);
    const f = createSafeFetch({ timeoutMs: 3000 });
    const err: any = await f("https://localhost:8443/").catch((e) => e);
    expect(String(err.cause?.message ?? err.message)).toMatch(/non-public/);
  });
  it("refuses plain http outright", async () => {
    await expect(createSafeFetch()("http://example.com/")).rejects.toThrow(/https/);
  });
});

describe("fetch behaviour over TLS (lookup relaxed to reach a local test server)", () => {
  let srv: Server, base: string, ca: string;
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "tls-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/k.pem`, "-out", `${dir}/c.pem`, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
    ca = readFileSync(`${dir}/c.pem`, "utf8");
    srv = httpsServer({ key: readFileSync(`${dir}/k.pem`), cert: ca }, (req, res) => {
      if (req.url === "/ok") return void res.writeHead(200, { "Content-Type": "application/json" }).end('{"hello":"world"}');
      if (req.url === "/redir") return void res.writeHead(302, { Location: "https://169.254.169.254/" }).end();
      if (req.url === "/big") return void res.writeHead(200).end("x".repeat(5000));
      if (req.url === "/slow") return; // never answers
      if (req.url === "/204") return void res.writeHead(204).end();
      res.writeHead(404).end('{"error":"nope"}');
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    base = `https://localhost:${(srv.address() as AddressInfo).port}`;
  });
  afterAll(() => srv.close());
  const lookup = ((h: string, o: any, cb: any) => (typeof o === "function" ? o : cb)(null, o?.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4)) as any;

  it("returns a normal Response for good upstreams", async () => {
    const f = createSafeFetch({ lookup, ca });
    const r = await f(`${base}/ok`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ hello: "world" });
    expect((await f(`${base}/nope`)).status).toBe(404);
    expect((await f(`${base}/204`)).status).toBe(204);
  });
  it("does not follow redirects (a tenant cannot bounce us to metadata endpoints)", async () => {
    await expect(createSafeFetch({ lookup, ca })(`${base}/redir`)).rejects.toThrow();
  });
  it("caps response size", async () => {
    await expect(createSafeFetch({ lookup, ca, maxBytes: 1000 })(`${base}/big`)).rejects.toThrow();
  });
  it("times out slow upstreams", async () => {
    const t = Date.now();
    await expect(createSafeFetch({ lookup, ca, timeoutMs: 400 })(`${base}/slow`)).rejects.toThrow();
    expect(Date.now() - t).toBeLessThan(3000);
  });
});
