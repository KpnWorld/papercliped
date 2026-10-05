#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp.js";

// stdout carries the protocol; anything human-readable must go to stderr.
createMcpServer()
  .connect(new StdioServerTransport())
  .catch((err) => {
    console.error("paperclip-bridge failed to start:", err);
    process.exit(1);
  });
