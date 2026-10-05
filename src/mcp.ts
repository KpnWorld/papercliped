import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PaperclipClient } from "./client.js";
import { readConfig, type BridgeConfig } from "./config.js";
import { executeTool, renderForModel } from "./execute.js";
import { tools } from "./tools.js";

export const SERVER_VERSION = "0.1.0";

export function createMcpServer(config: BridgeConfig = readConfig(), client = new PaperclipClient(config)) {
  const server = new McpServer({ name: "paperclip-bridge", version: SERVER_VERSION });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema.shape,
        annotations: {
          readOnlyHint: tool.access === "read",
          destructiveHint: tool.access === "destructive",
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        const out = await executeTool(client, tool.name, args);
        if (out.ok) return { content: [{ type: "text" as const, text: renderForModel(out.result) }] };
        const text = typeof out.error === "string" ? out.error : JSON.stringify(out.error, null, 2);
        return { isError: true, content: [{ type: "text" as const, text }] };
      },
    );
  }
  return server;
}
