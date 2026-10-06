/** Colour tokens for every theme, in light and dark. The contrast test checks every text/UI pair against WCAG AA. */
export interface Tokens {
  bg: string; // page background
  surface: string; // cards, panels
  ink: string; // body text
  muted: string; // secondary text (still AA)
  line: string; // decorative borders and dividers
  field: string; // input and control borders (UI contrast >= 3:1)
  accent: string; // brand colour: buttons, highlights
  accentInk: string; // text on accent
  link: string; // link text
  ring: string; // focus ring
}
export interface Palette {
  id: ThemeId;
  name: string;
  season: Season | "default";
  light: Tokens;
  dark: Tokens;
}
export type Season = "spring" | "summer" | "autumn" | "winter";
export type ThemeId = "clip" | "sakura" | "skyblue" | "citrus" | "lagoon" | "maple" | "harvest" | "frost" | "pine";
export type Mode = "light" | "dark";

export const PALETTES: Record<ThemeId, Palette> = {
  clip: {
    id: "clip", name: "Clip (default)", season: "default",
    light: { bg: "#fffddc", surface: "#fffff0", ink: "#0b0a07", muted: "#57564a", line: "#e7e3bb", field: "#8a8770", accent: "#47463c", accentInk: "#fffddc", link: "#3d3c2f", ring: "#47463c" },
    dark: { bg: "#16150f", surface: "#201f17", ink: "#f4f1d6", muted: "#bdb99f", line: "#35332a", field: "#7d7a64", accent: "#e9e4b0", accentInk: "#16150f", link: "#f0e7a0", ring: "#e9e4b0" },
  },
  sakura: {
    id: "sakura", name: "Cherry blossom", season: "spring",
    light: { bg: "#fff5f7", surface: "#ffffff", ink: "#2a1a1f", muted: "#6b4b55", line: "#f6d6de", field: "#a87483", accent: "#b8174f", accentInk: "#ffffff", link: "#a3134a", ring: "#b8174f" },
    dark: { bg: "#1d1216", surface: "#28191f", ink: "#fbe9ee", muted: "#d9aab8", line: "#3d2830", field: "#946575", accent: "#f48fb1", accentInk: "#1d1216", link: "#f8a5c2", ring: "#f48fb1" },
  },
  skyblue: {
    id: "skyblue", name: "Baby blue", season: "spring",
    light: { bg: "#f2f8ff", surface: "#ffffff", ink: "#10202f", muted: "#475d72", line: "#d3e5f7", field: "#7792ae", accent: "#1d68a8", accentInk: "#ffffff", link: "#1a5d96", ring: "#1d68a8" },
    dark: { bg: "#0f1822", surface: "#16222f", ink: "#e6f1fc", muted: "#a3bdd6", line: "#23354a", field: "#62809d", accent: "#8cc4f2", accentInk: "#0f1822", link: "#9fcdf5", ring: "#8cc4f2" },
  },
  citrus: {
    id: "citrus", name: "Citrus", season: "summer",
    light: { bg: "#fffbea", surface: "#ffffff", ink: "#2b2108", muted: "#665627", line: "#f2e3a6", field: "#a08b45", accent: "#a84d08", accentInk: "#ffffff", link: "#934307", ring: "#a84d08" },
    dark: { bg: "#1a1606", surface: "#241f0b", ink: "#fbf3d0", muted: "#d6c78f", line: "#3a3317", field: "#8a7b40", accent: "#fbbf24", accentInk: "#1a1606", link: "#fcd34d", ring: "#fbbf24" },
  },
  lagoon: {
    id: "lagoon", name: "Lagoon", season: "summer",
    light: { bg: "#effcf9", surface: "#ffffff", ink: "#0b2622", muted: "#3d6159", line: "#c9efe6", field: "#68968c", accent: "#0e6f67", accentInk: "#ffffff", link: "#0c655e", ring: "#0e6f67" },
    dark: { bg: "#0a1a18", surface: "#102522", ink: "#def8f2", muted: "#96cfc3", line: "#1d3a35", field: "#52877c", accent: "#5eead4", accentInk: "#0a1a18", link: "#7ef0dd", ring: "#5eead4" },
  },
  maple: {
    id: "maple", name: "Maple", season: "autumn",
    light: { bg: "#fff6ef", surface: "#ffffff", ink: "#2b160c", muted: "#6b4733", line: "#f3d9c6", field: "#a87b63", accent: "#a93f18", accentInk: "#ffffff", link: "#963815", ring: "#a93f18" },
    dark: { bg: "#1c110b", surface: "#271810", ink: "#fbeadf", muted: "#dcb39a", line: "#3d281c", field: "#946a53", accent: "#f59e6b", accentInk: "#1c110b", link: "#f7b088", ring: "#f59e6b" },
  },
  harvest: {
    id: "harvest", name: "Harvest", season: "autumn",
    light: { bg: "#fbf7ec", surface: "#ffffff", ink: "#231f12", muted: "#5c573d", line: "#e9e0c3", field: "#938b6a", accent: "#755810", accentInk: "#ffffff", link: "#674d0e", ring: "#755810" },
    dark: { bg: "#17150c", surface: "#211e12", ink: "#f5efd9", muted: "#c9bf96", line: "#36321f", field: "#817957", accent: "#e0b75a", accentInk: "#17150c", link: "#e8c675", ring: "#e0b75a" },
  },
  frost: {
    id: "frost", name: "Frost", season: "winter",
    light: { bg: "#f5f8fb", surface: "#ffffff", ink: "#141b24", muted: "#4b5867", line: "#dde5ee", field: "#808e9e", accent: "#33537a", accentInk: "#ffffff", link: "#2e4d70", ring: "#33537a" },
    dark: { bg: "#0e131a", surface: "#151c25", ink: "#e8eef5", muted: "#a9b7c7", line: "#243040", field: "#66778e", accent: "#a9c4e4", accentInk: "#0e131a", link: "#b9d0ec", ring: "#a9c4e4" },
  },
  pine: {
    id: "pine", name: "Pine", season: "winter",
    light: { bg: "#f3f7f2", surface: "#ffffff", ink: "#13201a", muted: "#475c50", line: "#d6e3d8", field: "#78907f", accent: "#23563d", accentInk: "#ffffff", link: "#1f4e37", ring: "#23563d" },
    dark: { bg: "#0d1511", surface: "#131e18", ink: "#e3f0e7", muted: "#a2c0ad", line: "#213229", field: "#607e6b", accent: "#8fcfa8", accentInk: "#0d1511", link: "#a3dab8", ring: "#8fcfa8" },
  },
};

export const THEME_IDS = Object.keys(PALETTES) as ThemeId[];

/** Each season rotates through its own palettes plus the default. */
export const SEASON_POOLS: Record<Season, ThemeId[]> = {
  spring: ["sakura", "skyblue", "clip"],
  summer: ["citrus", "lagoon", "clip"],
  autumn: ["maple", "harvest", "clip"],
  winter: ["frost", "pine", "clip"],
};
