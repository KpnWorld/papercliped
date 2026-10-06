import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { papercliped } from "./plugins/papercliped.ts";

export default defineConfig({
  plugins: [react(), papercliped()], // provides virtual:docs (and the theme CSS) in tests too
  server: { fs: { allow: [".."] } }, // CHANGELOG.md, site/*.md and the shared Markdown renderer live in the repo root
  test: { environment: "jsdom", setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.{ts,tsx}"] },
});
