import { THEME_IDS, type ThemeId } from "./palettes";
import { seasonalTheme } from "./rotation";

export type ThemeChoice = ThemeId | "season";
export type ModeChoice = "system" | "light" | "dark";
export const THEME_KEY = "pcl.theme";
export const MODE_KEY = "pcl.mode";

/** localStorage can be missing or throw (private mode, blocked storage): fall back to the defaults. */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* the choice just won't be remembered */
  }
}

export function readPrefs(): { theme: ThemeChoice; mode: ModeChoice } {
  const t = read(THEME_KEY);
  const m = read(MODE_KEY);
  return {
    theme: t && (THEME_IDS as string[]).includes(t) ? (t as ThemeId) : "season",
    mode: m === "light" || m === "dark" ? m : "system",
  };
}

export function resolveTheme(choice: ThemeChoice, date = new Date()): ThemeId {
  return choice === "season" ? seasonalTheme(date) : choice;
}

/** Put the choice on <html>. Shared by the pre-paint boot script and the theme picker. */
export function applyPrefs(theme: ThemeChoice, mode: ModeChoice, root: HTMLElement = document.documentElement, date = new Date()) {
  root.dataset.theme = resolveTheme(theme, date);
  if (mode === "system") delete root.dataset.mode;
  else root.dataset.mode = mode;
}

export function savePrefs(theme: ThemeChoice, mode: ModeChoice) {
  write(THEME_KEY, theme);
  write(MODE_KEY, mode);
}
