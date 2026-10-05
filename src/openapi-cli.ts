import { buildOpenApi } from "./openapi.js";

const url = process.env.BRIDGE_PUBLIC_URL ?? "https://YOUR-BRIDGE-HOST";
process.stdout.write(JSON.stringify(buildOpenApi(url), null, 2) + "\n");
