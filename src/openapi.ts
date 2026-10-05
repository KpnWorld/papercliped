import { zodToJsonSchema } from "zod-to-json-schema";
import { VERSION as SERVER_VERSION } from "./version.js";
import { tools } from "./tools.js";

/**
 * OpenAPI 3.1 for ChatGPT Custom GPT Actions. Generated from the same tool
 * catalogue the MCP server uses, so the two surfaces cannot drift.
 * Each tool is `POST /actions/{name}` with the tool input as the JSON body.
 */
export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, unknown> = {};
  for (const t of tools) {
    const { $schema, ...schema } = zodToJsonSchema(t.schema, { target: "openApi3" }) as Record<string, unknown>;
    paths[`/actions/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.title,
        description: t.description.slice(0, 300), // ChatGPT Actions caps descriptions at 300 chars
        "x-openai-isConsequential": t.access !== "read",
        requestBody: { required: true, content: { "application/json": { schema } } },
        responses: {
          "200": { description: "Tool result", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
          "400": { description: "Invalid input" },
          "401": { description: "Missing or invalid bearer token" },
          "403": { description: "Read-only mode or Paperclip denied the action" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Papercliped",
      version: SERVER_VERSION,
      description: "Control Paperclip agents, sync with them, and pull reports.",
    },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
    security: [{ bearerAuth: [] }],
    paths,
  };
}
