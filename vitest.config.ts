import { defineConfig } from "vitest/config";

// plugin/ (the Paperclip plugin) and web/ (the website) are separate packages with their own tests.
export default defineConfig({ test: { exclude: ["plugin/**", "web/**", "node_modules/**", "dist/**"] } });
