import { AUTH_FAILURE_REASONS, ERROR_CLASSES, PUBLIC_SCHEMA_VERSION, PUBLIC_WINDOWS } from "./types.js";

/**
 * OpenAPI for the public, aggregate-only API. Kept separate from /openapi.json on purpose: that document is imported as
 * ChatGPT Actions, and these system statistics are not tools the model should call.
 */
export function buildPublicOpenApi(serverUrl: string, version: string) {
  const win = { name: "window", in: "query", required: false, schema: { type: "string", enum: [...PUBLIC_WINDOWS], default: "24h" } };
  const counts = (keys: readonly string[]) => ({ type: "object", properties: Object.fromEntries(keys.map((k) => [k, { type: "integer" }])), required: [...keys] });
  const ok = (ref: string) => ({
    "200": { description: "OK (cached up to 30 s)", content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } } },
    "400": { description: "Invalid window" },
    "429": { description: "Rate limited (60 requests per minute per address)" },
    "503": { description: "Statistics temporarily unavailable" },
  });
  const latency = { type: "object", properties: { p50: { type: "number" }, p95: { type: "number" }, p99: { type: "number" } } };
  return {
    openapi: "3.1.0",
    info: { title: "Papercliped public API", version, description: `Aggregate-only system statistics (schemaVersion ${PUBLIC_SCHEMA_VERSION}). No identities, hosts or per-user data. CORS-open for GET, no credentials.` },
    servers: [{ url: serverUrl }],
    tags: [{ name: "public", description: "Public, read-only, aggregate statistics" }],
    paths: {
      "/api/public/v1/info": { get: { tags: ["public"], operationId: "publicInfo", summary: "API info", responses: ok("PublicInfo") } },
      "/api/public/v1/status": { get: { tags: ["public"], operationId: "publicStatus", summary: "Service status", responses: ok("PublicStatus") } },
      "/api/public/v1/stats": { get: { tags: ["public"], operationId: "publicStats", summary: "Aggregate statistics", parameters: [win], responses: ok("PublicStats") } },
      "/api/public/v1/series": { get: { tags: ["public"], operationId: "publicSeries", summary: "Statistics over time", parameters: [win], responses: ok("PublicSeries") } },
      "/api/public/v1/repo": { get: { tags: ["public"], operationId: "publicRepo", summary: "GitHub stars, forks and open issues (cached for an hour)", responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { repo: { type: "string" }, url: { type: "string" }, stars: { type: ["integer", "null"] }, forks: { type: ["integer", "null"] }, openIssues: { type: ["integer", "null"] }, fetchedAt: { type: ["string", "null"] } } } } } } } } },
      "/api/public/v1/errors": { get: { tags: ["public"], operationId: "publicErrors", summary: "Error mix", parameters: [win], responses: ok("PublicErrors") } },
    },
    components: {
      schemas: {
        PublicInfo: { type: "object", properties: { schemaVersion: { type: "integer" }, service: { type: "string" }, version: { type: "string" }, docs: { type: "string" }, endpoints: { type: "array", items: { type: "object", properties: { path: { type: "string" }, description: { type: "string" } } } } } },
        PublicStatus: { type: "object", properties: { schemaVersion: { type: "integer" }, status: { type: "string", enum: ["ok", "degraded", "down"] }, version: { type: "string" }, uptimeSeconds: { type: "integer" }, checkedAt: { type: "string", format: "date-time" } } },
        PublicStats: {
          type: "object",
          properties: {
            schemaVersion: { type: "integer" }, window: { type: "string" }, windowSeconds: { type: "integer" }, generatedAt: { type: "string", format: "date-time" },
            service: { type: "object", properties: { version: { type: "string" }, uptimeSeconds: { type: "integer" }, status: { type: "string" } } },
            users: { type: "object", properties: { total: { type: "integer" }, active: { type: "integer" }, new: { type: "integer" } } },
            connections: { type: "object", properties: { live: { type: "integer" } } },
            auth: { type: "object", properties: { flowsStarted: { type: "integer" }, flowsCompleted: { type: "integer" }, flowsFailed: { type: "integer" }, successRate: { type: ["number", "null"] }, failuresByReason: counts(AUTH_FAILURE_REASONS) } },
            requests: { type: "object", properties: { count: { type: "integer" }, errors: { type: "integer" }, faults: { type: "integer" }, successRate: { type: ["number", "null"] }, latencyMs: latency, callsPerMinute: { type: "number" }, byTool: { type: "object", additionalProperties: { type: "integer" }, description: "Calls per tool name from the public tool catalogue" } } },
            errors: { type: "object", properties: { total: { type: "integer" }, byClass: counts(ERROR_CLASSES) } },
            load: { type: "object", properties: { eventLoopLagP99Ms: { type: ["number", "null"] }, dbPingMs: { type: ["number", "null"] }, memoryMb: { type: ["number", "null"] }, bridgesReporting: { type: "integer" } } },
          },
        },
        PublicSeries: { type: "object", properties: { schemaVersion: { type: "integer" }, window: { type: "string" }, bucketSeconds: { type: "integer" }, buckets: { type: "array", items: { type: "object", properties: { t: { type: "string", format: "date-time" }, requests: { type: "integer" }, errors: { type: "integer" }, faults: { type: "integer" }, p95Ms: { type: "number" }, authCompleted: { type: "integer" }, authFailed: { type: "integer" }, newUsers: { type: "integer" } } } } } },
        PublicErrors: { type: "object", properties: { schemaVersion: { type: "integer" }, window: { type: "string" }, requests: { type: "integer" }, errorRate: { type: ["number", "null"] }, byClass: counts(ERROR_CLASSES), authFailuresByReason: counts(AUTH_FAILURE_REASONS) } },
      },
    },
  };
}
