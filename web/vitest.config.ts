import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { fs: { allow: [".."] } }, // CHANGELOG.md, site/*.md and the shared Markdown renderer live in the repo root
  test: { environment: "jsdom", setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.{ts,tsx}"] },
});
