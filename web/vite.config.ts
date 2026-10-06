import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { papercliped, SITE_CSP } from "./plugins/papercliped.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), papercliped()],
  build: {
    assetsInlineLimit: 0, // fonts and images stay files (font-src 'self'), never data: URIs
    modulePreload: { polyfill: false }, // no injected inline helper
    sourcemap: false,
  },
  preview: { headers: { "Content-Security-Policy": SITE_CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" } },
});
