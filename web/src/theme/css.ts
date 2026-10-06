import { PALETTES, type Tokens } from "./palettes";

const VAR: Record<keyof Tokens, string> = { bg: "--bg", surface: "--surface", ink: "--ink", muted: "--muted", line: "--line", field: "--field", accent: "--accent", accentInk: "--accent-ink", link: "--link", ring: "--ring" };
const decl = (t: Tokens, scheme: "light" | "dark") => `color-scheme:${scheme};` + (Object.keys(VAR) as (keyof Tokens)[]).map((k) => `${VAR[k]}:${t[k]}`).join(";");

/**
 * CSS for every theme. The palette is chosen by `data-theme` on <html>; light or dark always follows the device
 * (prefers-color-scheme). Without the attribute (e.g. scripts blocked) the default palette is used.
 */
export function themeCss(): string {
  const out: string[] = [];
  const clip = PALETTES.clip;
  out.push(`:root{${decl(clip.light, "light")}}`, `@media (prefers-color-scheme: dark){:root{${decl(clip.dark, "dark")}}}`);
  for (const p of Object.values(PALETTES)) {
    const sel = `:root[data-theme="${p.id}"]`;
    out.push(`${sel}{${decl(p.light, "light")}}`, `@media (prefers-color-scheme: dark){${sel}{${decl(p.dark, "dark")}}}`);
  }
  // Swatch classes for the design kit (no inline styles anywhere, so the CSP needs no 'unsafe-inline').
  for (const p of Object.values(PALETTES)) for (const mode of ["light", "dark"] as const) for (const k of Object.keys(VAR) as (keyof Tokens)[]) out.push(`.swatch-${p.id}-${mode}-${k}{background:${p[mode][k]}}`);
  return out.join("\n");
}
