// Builds the community cards in public/brand/community/ (Reddit, X and Discord posts), light and dark, 1600x900, and the
// r/OpenSourcedd banners (desktop and app),
// with the same mascot, palette and fonts as the site:  node scripts/community-cards.mjs
// Browser: CHROME_PATH, or Playwright's own Chromium.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "public/brand/community");
mkdirSync(out, { recursive: true });

const font = (f) => `data:font/woff2;base64,${readFileSync(join(root, "public/fonts", f)).toString("base64")}`;
// The "clip" palette from src/theme/palettes.ts.
const PALETTE = {
  dark: { bg: "#16150f", surface: "#201f17", ink: "#f4f1d6", muted: "#bdb99f", line: "#35332a", accent: "#e9e4b0", accentInk: "#16150f" },
  light: { bg: "#fffddc", surface: "#fffff0", ink: "#0b0a07", muted: "#57564a", line: "#e7e3bb", accent: "#47463c", accentInk: "#fffddc" },
};
// The mascot from public/brand/mascot-*.svg, coloured from the palette.
const MASCOT = `<svg viewBox="0 0 64 64"><path d="M22 38V19a10 10 0 0 1 20 0v24a14 14 0 0 1-28 0V24" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26.5" cy="44.5" r="4" fill="var(--surface)"/><circle cx="37.5" cy="44.5" r="4" fill="var(--surface)"/><circle cx="27.3" cy="45.2" r="2" fill="var(--ink)"/><circle cx="38.3" cy="45.2" r="2" fill="var(--ink)"/><path d="M28.5 52q3.5 3 7 0" fill="none" stroke="var(--surface)" stroke-width="2" stroke-linecap="round"/><circle cx="21.5" cy="50" r="2.2" fill="#e98a7a" opacity=".85"/><circle cx="42.5" cy="50" r="2.2" fill="#e98a7a" opacity=".85"/></svg>`;

const CARDS = {
  "opensourcedd-welcome": {
    badge: "👋",
    kicker: "r/OpenSourcedd",
    title: "Welcome to<br><span>OpenSourcedd</span>",
    text: "Open-source tools for AI agents, built together.<br><b>Starting with Papercliped.</b>",
    chips: ["💡 Suggest ideas", "🛠️ Share projects", "👀 Review work", "🤝 Help others"],
    foot: ["papercliped.co", "github.com/OpenSourcx"],
  },
  "papercliped-launch": {
    badge: "🚀",
    kicker: "Papercliped is live · free and open source",
    title: "Run your Paperclip<br>from <span>any AI app</span>",
    text: "Check on agents, assign work, decide approvals and get reports in plain language.",
    chips: ["Claude", "ChatGPT", "Codex", "Any MCP app"],
    code: "Connector: https://mcp.papercliped.co/mcp",
    foot: ["papercliped.co", "r/OpenSourcedd"],
  },
};

const page = (c, mode) => {
  const p = PALETTE[mode];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Brico;src:url(${font("bricolage-grotesque-latin-wght-normal.woff2")});font-weight:200 800}
@font-face{font-family:Inter;src:url(${font("inter-latin-wght-normal.woff2")});font-weight:100 900}
@font-face{font-family:Mono;src:url(${font("jetbrains-mono-latin-400-normal.woff2")})}
:root{${Object.entries(p).map(([k, v]) => `--${k}:${v}`).join(";")}}
html,body{margin:0}
#frame{width:1600px;height:900px;background:var(--bg);color:var(--ink);font-family:Inter;position:relative;overflow:hidden;display:flex;align-items:center;box-sizing:border-box;padding:0 110px;gap:80px}
.dots{position:absolute;inset:0;background-image:radial-gradient(var(--line) 1.6px,transparent 1.6px);background-size:36px 36px;opacity:.7;mask-image:radial-gradient(ellipse at 85% 15%,#000 0,transparent 55%)}
.mascot{width:340px;height:340px;flex:none;border-radius:84px;background:var(--surface);border:3px solid var(--line);display:grid;place-items:center;position:relative;transform:rotate(-4deg)}
.mascot svg{width:300px;height:300px}
.badge{position:absolute;top:-30px;right:-34px;font-size:84px;transform:rotate(14deg)}
.text{position:relative;flex:1}
.kicker{font-family:Mono;font-size:28px;color:var(--muted);margin-bottom:22px}
h1{font-family:Brico;font-weight:800;font-size:100px;line-height:.98;letter-spacing:-.025em;margin:0 0 30px}
h1 span{display:inline-block;background:var(--accent);color:var(--accentInk);padding:0 22px 8px;border-radius:24px;margin-top:10px}
p{font-size:34px;line-height:1.35;color:var(--muted);margin:0 0 36px;max-width:920px}
p b{color:var(--ink);font-weight:600}
.chips{display:flex;gap:12px;align-items:center}
.chip{white-space:nowrap;font-size:23px;font-weight:600;padding:11px 18px;border-radius:999px;border:2px solid var(--line);background:var(--surface)}
.code{display:inline-block;font-family:Mono;font-size:26px;padding:12px 20px;border-radius:14px;background:var(--accent);color:var(--accentInk);margin-top:18px}
.foot{position:absolute;bottom:44px;left:120px;right:120px;display:flex;justify-content:space-between;font-family:Mono;font-size:22px;color:var(--muted)}
</style></head><body><div id="frame"><div class="dots"></div>
<div class="mascot"><div class="badge">${c.badge}</div>${MASCOT}</div>
<div class="text"><div class="kicker">${c.kicker}</div><h1>${c.title}</h1><p>${c.text}</p>
<div class="chips">${c.chips.map((x) => `<div class="chip">${x}</div>`).join("")}</div>${c.code ? `<div class="code">${c.code}</div>` : ""}</div>
<div class="foot"><span>${c.foot[0]}</span><span>${c.foot[1]}</span></div></div></body></html>`;
};

// Reddit community banners at twice Reddit's sizes: desktop 1072x128 -> 2144x256, app 1080x128 -> 2160x256. The app shows the
// banner about a third as wide as desktop, so its version drops the tagline and keeps only what reads at that size.
const BANNERS = [
  { name: "opensourcedd-reddit-banner", w: 2144, h: 256, tagline: true },
  { name: "opensourcedd-reddit-banner-mobile", w: 2160, h: 256, tagline: false },
];
const banner = (mode, b) => {
  const p = PALETTE[mode];
  const big = !b.tagline;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Brico;src:url(${font("bricolage-grotesque-latin-wght-normal.woff2")});font-weight:200 800}
@font-face{font-family:Inter;src:url(${font("inter-latin-wght-normal.woff2")});font-weight:100 900}
:root{${Object.entries(p).map(([k, v]) => `--${k}:${v}`).join(";")}}
html,body{margin:0}
#frame{width:${b.w}px;height:${b.h}px;background:var(--bg);color:var(--ink);font-family:Inter;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:${big ? 44 : 36}px}
.dots{position:absolute;inset:0;background-image:radial-gradient(var(--line) 2px,transparent 2px);background-size:28px 28px;mask-image:linear-gradient(90deg,#000 0,transparent 32%,transparent 68%,#000 100%)}
.mascot{position:relative;width:${big ? 184 : 164}px;height:${big ? 184 : 164}px;flex:none;border-radius:44px;background:var(--surface);border:3px solid var(--line);display:grid;place-items:center;transform:rotate(-4deg)}
.mascot svg{width:${big ? 160 : 142}px;height:${big ? 160 : 142}px}
.text{position:relative}
h1{font-family:Brico;font-weight:800;font-size:${big ? 132 : 96}px;line-height:1;letter-spacing:-.025em;margin:0;white-space:nowrap}
h1 span{background:var(--accent);color:var(--accentInk);padding:0 16px 6px;border-radius:20px;margin-left:4px}
p{font-size:30px;color:var(--muted);margin:22px 0 0;white-space:nowrap}
p b{color:var(--ink);font-weight:600}
</style></head><body><div id="frame"><div class="dots"></div>
<div class="mascot">${MASCOT}</div>
<div class="text"><h1>Open<span>Sourcedd</span></h1>${b.tagline ? "<p>Open-source tools for AI agents, built together. <b>Home of Papercliped.</b></p>" : ""}</div></div></body></html>`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const [name, card] of Object.entries(CARDS)) {
  for (const mode of ["dark", "light"]) {
    const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await p.setContent(page(card, mode));
    await p.evaluate(() => document.fonts.ready);
    await p.locator("#frame").screenshot({ path: join(out, `${name}-${mode}.png`) });
    await p.close();
  }
}
for (const b of BANNERS) {
  for (const mode of ["dark", "light"]) {
    const p = await browser.newPage({ viewport: { width: b.w, height: b.h } });
    await p.setContent(banner(mode, b));
    await p.evaluate(() => document.fonts.ready);
    await p.locator("#frame").screenshot({ path: join(out, `${b.name}-${mode}.png`) });
    await p.close();
  }
}
await browser.close();
console.log(`wrote ${Object.keys(CARDS).length * 2} cards and ${BANNERS.length * 2} banners to public/brand/community`);
