#!/usr/bin/env node
import { readConfig, readHttpConfig } from "./config.js";
import { createHttpServer } from "./server.js";

async function main() {
  const config = readConfig();
  let http;
  try {
    http = readHttpConfig();
  } catch (e) {
    console.error(`Configuration error: ${(e as Error).message}`);
    process.exit(1);
  }
  if (!http.bridgeToken && !http.oauth) {
    console.error("Refusing to start: set BRIDGE_TOKEN (e.g. `openssl rand -hex 32`) and/or BRIDGE_OAUTH=1. The bridge exposes control of your agents.");
    process.exit(1);
  }
  const server = createHttpServer(config, http);
  server.listen(http.port, http.host, () => {
    console.error(
      `paperclip-bridge listening on http://${http.host}:${http.port} → ${config.apiUrl}${config.readOnly ? " [read-only]" : ""}${http.oauth ? ` [oauth: ${http.oauth.login} login, issuer ${http.oauth.issuer}]` : ""}`,
    );
  });
}

void main();
