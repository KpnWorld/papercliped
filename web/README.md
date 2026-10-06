# papercliped-web

The Papercliped website: landing page, docs, changelog and community pages. A static React app (Vite, React 18, TypeScript, Tailwind CSS 4) that the bridge serves from its own origin. It is not part of the `papercliped` npm package.

```sh
npm ci
npm run dev            # http://localhost:5173
npm test               # components, theme rotation, WCAG contrast of every theme x mode
npm run build          # typecheck + dist/
npm run check:routes   # every route in headless Chromium under the site CSP (CHROME_PATH or `npx playwright-core install chromium`)
```

## Rules this site keeps
- **No third-party requests.** Fonts, icons and images are self-hosted; no analytics or trackers.
- **Strict CSP:** `script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:` and nothing inline. The theme is applied before first paint by `/theme-boot.js`, an external file built from `src/theme/boot.ts`. `vite preview` sends the same CSP (see `plugins/papercliped.ts`), so `check:routes` catches violations.
- **Accessible by default:** every text colour pair is at least 4.5:1 and every control/focus colour at least 3:1 in every theme and mode (`test/contrast.test.ts` fails the build otherwise); motion respects `prefers-reduced-motion`.

## Themes
Tokens live in `src/theme/palettes.ts` (`clip` is the default; spring: cherry blossom and baby blue; summer: citrus and lagoon; autumn: maple and harvest; winter: frost and pine). Mode follows the system unless the visitor picks light or dark.

When following the season, the theme is the same for everyone on a given UTC date, with no server state: the season comes from the date, and within it a seeded schedule (keyed by year and season) shows each palette of the season, plus `clip`, in runs of 1 to 3 days (`src/theme/rotation.ts`). Visitors can pick a theme instead; the choice stays in their browser.

## Community links
All social and community URLs are in `src/config/community.ts` and are empty until we own the accounts. A link is rendered only when its URL is set. Set them at build time: `VITE_DISCORD_URL`, `VITE_X_URL`, `VITE_DISCUSSIONS_URL`, `VITE_FORUM_URL`.
