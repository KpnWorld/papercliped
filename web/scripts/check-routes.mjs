// Loads every route of the built site in headless Chromium, under the same CSP the bridge sends, and fails on any console
// error, page error, CSP violation, failed request or request to another origin.
//   npm run build && node scripts/check-routes.mjs [--screenshots <dir>]
// Browser: CHROME_PATH, or Playwright's own Chromium (npx playwright install chromium).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url).pathname;
const ROUTES = JSON.parse(/ROUTES = (\[[^\]]*\])/.exec(readFileSync(join(root, "src/App.tsx"), "utf8"))[1].replace(/'/g, '"'));
const THEMES = []; // read from the palettes file
const palettes = readFileSync(join(root, "src/theme/palettes.ts"), "utf8");
for (const m of palettes.matchAll(/^  (\w+): \{\n    id: "\1"/gm)) THEMES.push(m[1]);
const shotsAt = process.argv.indexOf("--screenshots");
const shotsDir = shotsAt > 0 ? process.argv[shotsAt + 1] : null;

const port = await new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {}
  if (i === 59) throw new Error("vite preview did not start");
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const problems = [];
try {
  const ctx = await browser.newContext();
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
    page.on("requestfailed", (r) => errs.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
    page.on("request", (r) => !r.url().startsWith(base) && !r.url().startsWith("data:") && errs.push(`third-party request: ${r.url()}`));
    const res = await page.goto(base + route, { waitUntil: "networkidle" });
    if (!res || res.status() !== 200) errs.push(`status ${res?.status()}`);
    const h1 = await page.locator("h1").count();
    if (h1 !== 1) errs.push(`expected one <h1>, found ${h1}`);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    if (!THEMES.includes(theme)) errs.push(`no theme applied before render (data-theme=${theme})`);
    if (errs.length) problems.push(`${route}\n  - ${errs.join("\n  - ")}`);
    else console.log(`ok ${route} (theme ${theme})`);
    await page.close();
  }

  if (shotsDir) {
    mkdirSync(shotsDir, { recursive: true });
    for (const theme of THEMES) for (const mode of ["light", "dark"]) {
      const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: mode });
      await c.addInitScript(([t, m]) => { localStorage.setItem("pcl.theme", t); localStorage.setItem("pcl.mode", m); }, [theme, mode]);
      const p = await c.newPage();
      await p.goto(`${base}/kit`, { waitUntil: "networkidle" });
      await p.screenshot({ path: join(shotsDir, `kit-${theme}-${mode}.png`) });
      await p.goto(`${base}/`, { waitUntil: "networkidle" });
      await p.screenshot({ path: join(shotsDir, `home-${theme}-${mode}.png`) });
      await c.close();
    }
    console.log(`screenshots in ${shotsDir}`);
  }
} finally {
  await browser.close();
  server.kill();
}
if (problems.length) {
  console.error(`check-routes: ${problems.length} route(s) failed\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`check-routes: ${ROUTES.length} routes render cleanly under the site CSP`);
process.exit(0);
