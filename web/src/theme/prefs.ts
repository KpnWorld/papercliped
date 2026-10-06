import { THEME_IDS, type ThemeId } from "./palettes";
import { seasonalTheme } from "./rotation";

export type ThemeChoice = ThemeId | "season";
export const THEME_KEY = "pcl.theme";
/** Left over from when light/dark was a manual switch; cleared so old choices don't linger. Mode now follows the device. */
const OLD_MODE_KEY = "pcl.mode";

/** localStorage can be missing or throw (private mode, blocked storage): fall back to the defaults. */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* the choice just won't be remembered */
  }
}

export function readPrefs(): { theme: ThemeChoice } {
  const t = read(THEME_KEY);
  return { theme: t && (THEME_IDS as string[]).includes(t) ? (t as ThemeId) : "season" };
}

export function resolveTheme(choice: ThemeChoice, date = new Date()): ThemeId {
  return choice === "season" ? seasonalTheme(date) : choice;
}

/** Put the palette on <html>. Light or dark always follows the device (prefers-color-scheme), so there's nothing to set. */
export function applyPrefs(theme: ThemeChoice, root: HTMLElement = document.documentElement, date = new Date()) {
  root.dataset.theme = resolveTheme(theme, date);
  delete root.dataset.mode;
}

export function savePrefs(theme: ThemeChoice) {
  write(THEME_KEY, theme === "season" ? null : theme);
  write(OLD_MODE_KEY, null);
}
