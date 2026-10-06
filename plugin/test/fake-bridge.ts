import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** A minimal stand-in for the Papercliped bridge's /api/manage routes (the contract the plugin relies on). */
export interface FakeBridge {
  url: string;
  server: Server;
  seen: { method: string; path: string; headers: Record<string, string | string[] | undefined>; body: any }[];
  codes: Map<string, { used: boolean }>;
  tokens: Map<string, { revoked: boolean }>;
  connections: { id: string; app: string; level: string; createdAt: number; lastUsedAt: number | null }[];
  me: Record<string, unknown>;
}

export async function startFakeBridge(): Promise<FakeBridge> {
  const f: FakeBridge = { url: "", server: null as any, seen: [], codes: new Map(), tokens: new Map(), connections: [{ id: "g1", app: "Claude", level: "paperclip:read", createdAt: Date.now(), lastUsedAt: null }], me: { name: "ann.test1", anonymous: false, alias: null, beta: true, paperclip: "paperclip.example.com", connected: true } };
  f.server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : undefined;
    f.seen.push({ method: req.method!, path: req.url!, headers: req.headers, body });
    const send = (s: number, j: unknown) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
    if (req.url === "/api/public/v1/status") return send(200, { schemaVersion: 1, status: "ok", version: "2.0.0", uptimeSeconds: 60, checkedAt: new Date().toISOString() });
    if (req.url === "/api/public/v1/stats?window=24h") return send(200, { users: { total: 42 }, connections: { live: 7 }, requests: { successRate: 0.95, latencyMs: { p95: 460 } }, auth: { successRate: 0.9 } });
    const route = req.url!.replace("/api/manage", "");
    if (req.method === "POST" && route === "/plugin-link/exchange") {
      const c = f.codes.get(body?.code);
      if (!c || c.used) return send(400, { error: "That code is not valid." });
      c.used = true;
      const token = `pcb_pl_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      f.tokens.set(token, { revoked: false });
      return send(200, { token });
    }
    const token = /^Bearer (\S+)$/.exec(String(req.headers.authorization ?? ""))?.[1];
    const t = token ? f.tokens.get(token) : undefined;
    if (!t || t.revoked) return send(401, { error: "Link the plugin again" });
    if (req.method === "GET" && route === "/me") return send(200, f.me);
    if (req.method === "GET" && route === "/connections") return send(200, { connections: f.connections });
    const m = /^\/connections\/(.+)$/.exec(route);
    if (m && req.method === "POST") { const c = f.connections.find((x) => x.id === m[1]); if (!c) return send(404, { error: "No such connection" }); c.level = `paperclip:${body.level}`; return send(200, { ok: true }); }
    if (m && req.method === "DELETE") { f.connections = f.connections.filter((x) => x.id !== m[1]); return send(200, { ok: true }); }
    if (req.method === "POST" && route === "/privacy") { f.me = { ...f.me, anonymous: body.anonymous, alias: body.anonymous ? "Ann02" : null }; return send(200, { anonymous: body.anonymous, alias: f.me.alias, name: body.anonymous ? "Ann02" : "ann.test1" }); }
    if (req.method === "DELETE" && route === "/plugin-links/self") { t.revoked = true; return send(200, { ok: true }); }
    return send(404, { error: "Not found" });
  });
  await new Promise<void>((r) => f.server.listen(0, "127.0.0.1", r));
  f.url = `http://127.0.0.1:${(f.server.address() as AddressInfo).port}`;
  return f;
}

export function newCode(f: FakeBridge) {
  const code = `pcl_${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  f.codes.set(code, { used: false });
  return code;
}
