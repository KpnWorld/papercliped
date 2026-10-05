#!/usr/bin/env node
import { readConfig, readHttpConfig } from "./config.js";
import { createHttpServer } from "./server.js";

async function main() {
  const config = readConfig();
  const http = readHttpConfig();
  if (!http.bridgeToken) {
    console.error("Refusing to start: set BRIDGE_TOKEN (e.g. `openssl rand -hex 32`). The bridge exposes control of your agents.");
    process.exit(1);
  }
  const server = createHttpServer(config, http);
  server.listen(http.port, http.host, () => {
    console.error(
      `paperclip-bridge listening on http://${http.host}:${http.port} → ${config.apiUrl}${config.readOnly ? " [read-only]" : ""}`,
    );
  });
}

void main();
