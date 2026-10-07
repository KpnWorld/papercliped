import { z } from "zod";
import { VERSION as SERVER_VERSION } from "./version.js";
import { tools } from "./tools.js";

/**
 * OpenAPI 3.1 for ChatGPT Custom GPT Actions. Generated from the same tool
 * catalogue the MCP server uses, so the two surfaces cannot drift.
 * Each tool is `POST /actions/{name}` with the tool input as the JSON body.
 */
/**
 * Zod's JSON Schema for a tool input, shaped like the hand-checked contract ChatGPT Actions have always seen: objects with
 * fixed properties reject unknown keys, and Zod-only string formats (e.g. "starts_with") are left out.
 */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (!(k === "format" && v === "starts_with")) out[k] = tidy(v);
  if (out.type === "object" && out.properties && !("additionalProperties" in out)) out.additionalProperties = false;
  return out;
}

export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, unknown> = {};
  for (const t of tools) {
    const { $schema, ...schema } = tidy(z.toJSONSchema(t.schema, { target: "openapi-3.0", io: "input" })) as Record<string, unknown>;
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
