import { PALETTES, type Tokens } from "./palettes";

const VAR: Record<keyof Tokens, string> = { bg: "--bg", surface: "--surface", ink: "--ink", muted: "--muted", line: "--line", field: "--field", accent: "--accent", accentInk: "--accent-ink", link: "--link", ring: "--ring" };
const decl = (t: Tokens, scheme: "light" | "dark") => `color-scheme:${scheme};` + (Object.keys(VAR) as (keyof Tokens)[]).map((k) => `${VAR[k]}:${t[k]}`).join(";");

/**
 * CSS for every theme. The theme is chosen by `data-theme` on <html>; the mode follows the system unless `data-mode`
 * forces light or dark. Without any attribute (e.g. scripts blocked) the default theme still follows the system mode.
 */
export function themeCss(): string {
  const out: string[] = [];
  const clip = PALETTES.clip;
  out.push(`:root{${decl(clip.light, "light")}}`, `@media (prefers-color-scheme: dark){:root:not([data-mode="light"]){${decl(clip.dark, "dark")}}}`, `:root[data-mode="dark"]{${decl(clip.dark, "dark")}}`);
  for (const p of Object.values(PALETTES)) {
    const sel = `:root[data-theme="${p.id}"]`;
    out.push(`${sel}{${decl(p.light, "light")}}`, `@media (prefers-color-scheme: dark){${sel}:not([data-mode="light"]){${decl(p.dark, "dark")}}}`, `${sel}[data-mode="dark"]{${decl(p.dark, "dark")}}`);
  }
  // Swatch classes for the design kit (no inline styles anywhere, so the CSP needs no 'unsafe-inline').
  for (const p of Object.values(PALETTES)) for (const mode of ["light", "dark"] as const) for (const k of Object.keys(VAR) as (keyof Tokens)[]) out.push(`.swatch-${p.id}-${mode}-${k}{background:${p[mode][k]}}`);
  return out.join("\n");
}
