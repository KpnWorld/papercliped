import { build } from "esbuild";
import type { Plugin } from "vite";
import { resolve } from "node:path";

const VIRTUAL = "virtual:themes.css";
const RESOLVED = "\0virtual:themes.css";
const BOOT = "theme-boot.js";

/**
 * The CSP the bridge sends for these pages (kept here so `vite preview` enforces the same thing and the route check catches
 * violations): everything from our own origin, no inline scripts or styles, no third parties.
 */
export const SITE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

async function bootScript(root: string): Promise<string> {
  const r = await build({ entryPoints: [resolve(root, "src/theme/boot.ts")], bundle: true, write: false, format: "iife", minify: true, target: "es2019" });
  return r.outputFiles[0].text;
}

/** Compile src/theme/css.ts on the fly (the config runs in plain Node) and return the theme stylesheet. */
async function themeStylesheet(root: string): Promise<string> {
  const r = await build({ entryPoints: [resolve(root, "src/theme/css.ts")], bundle: true, write: false, format: "esm", platform: "node" });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString("base64")}`);
  return mod.themeCss();
}

export function papercliped(): Plugin {
  let root = process.cwd();
  return {
    name: "papercliped",
    configResolved(c) {
      root = c.root;
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      for (const f of ["css.ts", "palettes.ts"]) this.addWatchFile(resolve(root, "src/theme", f));
      return themeStylesheet(root);
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== `/${BOOT}`) return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(await bootScript(root));
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: BOOT, source: await bootScript(root) });
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // Preload the two faces every page uses, by their hashed names.
        if (!ctx.bundle) return html;
        const fonts = Object.keys(ctx.bundle).filter((f) => /(inter|bricolage-grotesque)-latin-wght-normal-.*\.woff2$/.test(f));
        const links = fonts.map((f) => `<link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin>`).join("\n    ");
        return html.replace("</title>", `</title>\n    ${links}`);
      },
    },
  };
}
