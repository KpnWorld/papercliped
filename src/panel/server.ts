import { createServer, type IncomingMessage, type Server } from "node:http";
import { ipMatcher } from "./config.js";
import type { PanelRoutes } from "./routes.js";

export interface PanelServerOptions {
  routes: PanelRoutes;
  /** IPs / IPv4 CIDRs allowed to reach the panel at all. */
  allowedIps?: string[] | null;
  proxyHops?: number;
}

/** Client address: `hops` entries from the right of X-Forwarded-For (a client can only forge the left side). */
export function clientAddress(req: IncomingMessage, hops: number): string {
  if (hops > 0) {
    const parts = String(req.headers["x-forwarded-for"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= hops) return parts[parts.length - hops];
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function createPanelServer(o: PanelServerOptions): Server {
  const allowed = o.allowedIps?.length ? ipMatcher(o.allowedIps) : null;
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://panel");
      if (url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return void res.end('{"ok":true}');
      }
      if (allowed && !allowed(clientAddress(req, o.proxyHops ?? 0))) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        return void res.end("Forbidden");
      }
      if (!(await o.routes.handle(req, res, url)) && !res.headersSent) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end('{"error":"Not found"}');
      }
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end('{"error":"Internal error"}');
      }
    }
  });
}
