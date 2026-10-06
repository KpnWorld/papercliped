// Loads every route of the built site in headless Chromium, under the same CSP the bridge sends, and fails on any console
// error, page error, CSP violation, failed request or request to another origin.
//   npm run build && node scripts/check-routes.mjs [--screenshots <dir>]
// Browser: CHROME_PATH, or Playwright's own Chromium (npx playwright install chromium).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

const FIX = JSON.parse(readFileSync(new URL("./fixtures/public-api.json", import.meta.url), "utf8"));
// The bridge serves the public API; the static preview doesn't, so answer it with fixtures.
const fakeApi = (r) => {
  const u = r.request().url();
  const body = u.includes("/v1/status") ? FIX.status : u.includes("/v1/series") ? FIX.series : u.includes("/v1/stats") ? FIX.stats : u.includes("/v1/repo") ? FIX.repo : FIX.legacy;
  return r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
};

const root = new URL("..", import.meta.url).pathname;
const BASE_ROUTES = JSON.parse(/ROUTES = (\[[^\]]*\])/.exec(readFileSync(join(root, "src/App.tsx"), "utf8"))[1].replace(/'/g, '"'));
const DOC_SLUGS = [...readFileSync(join(root, "src/content/docs-nav.ts"), "utf8").matchAll(/slugs: \[([^\]]*)\]/g)].flatMap((m) => JSON.parse(`[${m[1]}]`));
const ROUTES = [...BASE_ROUTES, ...DOC_SLUGS.map((s) => `/docs/${s}`)];
/** Paths only the bridge serves (not the static preview); links to them are fine but can't be loaded here. */
const BRIDGE_ONLY = /^\/(manage|api\/|mcp|healthz|readyz|authorize|openapi\.json)/;
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
const links = new Set();
try {
  const ctx = await browser.newContext();
  // The bridge serves the stats API; the static preview doesn't, so answer it here with a fixture.
  await ctx.route("**/api/public/**", fakeApi);
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.route("**/api/public/**", fakeApi);
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
    for (const href of await page.evaluate(() => [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")))) links.add(href.split("#")[0]);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    if (!THEMES.includes(theme)) errs.push(`no theme applied before render (data-theme=${theme})`);
    // Mobile: nothing may scroll sideways on a 375px-wide phone.
    const mp = await phone.newPage();
    mp.on("pageerror", (e) => errs.push(`mobile pageerror: ${e.message}`));
    await mp.goto(base + route, { waitUntil: "networkidle" });
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) {
      const wide = await mp.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`));
      errs.push(`mobile: page is ${overflow}px wider than a 375px screen (${wide.join(", ")})`);
    }
    if (shotsDir) { mkdirSync(shotsDir, { recursive: true }); await mp.screenshot({ path: join(shotsDir, `mobile${route === "/" ? "-home" : route.replace(/\//g, "-")}.png`), fullPage: true }); }
    await mp.close();
    if (errs.length) problems.push(`${route}\n  - ${errs.join("\n  - ")}`);
    else console.log(`ok ${route} (theme ${theme})`);
    await page.close();
  }

  // Every internal link found on any page must resolve: app pages render (not "Page not found"), static files exist.
  const visited = new Set(ROUTES);
  for (const href of [...links].sort()) {
    if (!href || visited.has(href) || BRIDGE_ONLY.test(href)) continue;
    visited.add(href);
    if (/\.[a-z0-9]+$/i.test(href)) {
      const r = await fetch(base + href);
      if (!r.ok) problems.push(`link ${href}: ${r.status}`);
      continue;
    }
    const p = await ctx.newPage();
    await p.goto(base + href, { waitUntil: "networkidle" });
    const h1 = await p.locator("h1").first().textContent().catch(() => null);
    if (!h1 || /Page not found/.test(h1)) problems.push(`link ${href}: renders "${h1}"`);
    await p.close();
  }
  console.log(`checked ${visited.size} internal paths`);

  if (shotsDir) {
    mkdirSync(shotsDir, { recursive: true });
    for (const theme of THEMES) for (const mode of ["light", "dark"]) {
      const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: mode });
      // Light or dark comes from the device (colorScheme); only the palette is a stored choice.
      await c.addInitScript((t) => localStorage.setItem("pcl.theme", t), theme);
      const p = await c.newPage();
      await c.route("**/api/public/**", fakeApi);
      await p.goto(`${base}/kit`, { waitUntil: "networkidle" });
      await p.screenshot({ path: join(shotsDir, `kit-${theme}-${mode}.png`) });
      await p.goto(`${base}/`, { waitUntil: "networkidle" });
      await p.screenshot({ path: join(shotsDir, `home-${theme}-${mode}.png`) });
      if (theme === "clip") {
        await p.screenshot({ path: join(shotsDir, `home-full-${mode}.png`), fullPage: true });
        for (const [name, path] of [["docs", "/docs"], ["doc", "/docs/permissions"], ["changelog", "/changelog"]]) {
          await p.goto(`${base}${path}`, { waitUntil: "networkidle" });
          await p.screenshot({ path: join(shotsDir, `${name}-${mode}.png`) });
        }
      }
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
