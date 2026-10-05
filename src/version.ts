import { createRequire } from "node:module";

/** The package version, read from package.json at runtime so releases only bump one place. */
export const VERSION: string = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
