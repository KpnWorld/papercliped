import { defineConfig } from "vitest/config";

// The Paperclip plugin in plugin/ is its own package with its own tests (`npm --prefix plugin test`).
export default defineConfig({ test: { exclude: ["plugin/**", "node_modules/**", "dist/**"] } });
