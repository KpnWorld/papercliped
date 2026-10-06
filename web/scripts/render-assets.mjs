// Renders the wordmark PNGs and the social preview image (public/og.png) from the live components, so they always match
// the site. Run after `npm run build`:  node scripts/render-assets.mjs   (CHROME_PATH or Playwright's Chromium)
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url).pathname;
const port = await new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const shoot = async (kind, mode, out, scale = 2) => {
  const ctx = await browser.newContext({ deviceScaleFactor: scale, viewport: { width: 1400, height: 900 }, colorScheme: mode });
  await ctx.addInitScript((m) => { localStorage.setItem("pcl.theme", "clip"); localStorage.setItem("pcl.mode", m); }, mode);
  const p = await ctx.newPage();
  await p.goto(`${base}/__render?kind=${kind}`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.locator("#frame").screenshot({ path: join(root, out), omitBackground: false });
  await ctx.close();
  console.log(`wrote ${out}`);
};
try {
  await shoot("wordmark", "light", "public/brand/wordmark-light.png");
  await shoot("wordmark", "dark", "public/brand/wordmark-dark.png");
  await shoot("og", "light", "public/og.png", 1);
} finally {
  await browser.close();
  server.kill();
}
process.exit(0);
