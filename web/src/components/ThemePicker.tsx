import { useEffect, useState } from "react";
import { PALETTES, THEME_IDS } from "../theme/palettes";
import { applyPrefs, readPrefs, resolveTheme, savePrefs, type ModeChoice, type ThemeChoice } from "../theme/prefs";

/** Theme (follow the season, or pick one) and mode (system, light, dark). Remembered in this browser only. */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeChoice>(() => readPrefs().theme);
  const [mode, setMode] = useState<ModeChoice>(() => readPrefs().mode);
  useEffect(() => {
    applyPrefs(theme, mode);
    savePrefs(theme, mode);
  }, [theme, mode]);
  const today = PALETTES[resolveTheme("season")].name;
  return (
    <div className={compact ? "flex items-center gap-2" : "flex flex-wrap items-end gap-3"}>
      <label className="flex flex-col gap-1 text-sm">
        <span className={compact ? "sr-only" : "font-medium"}>Theme</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeChoice)} className="h-9 rounded-lg border border-field bg-bg px-2 text-ink">
          <option value="season">Follow the season ({today})</option>
          {THEME_IDS.map((id) => <option key={id} value={id}>{PALETTES[id].name}</option>)}
        </select>
      </label>
      <fieldset className="flex items-center gap-1 text-sm">
        <legend className={compact ? "sr-only" : "mb-1 font-medium"}>Mode</legend>
        {(["system", "light", "dark"] as const).map((m) => (
          <label key={m} className="cursor-pointer">
            <input type="radio" name="pcl-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="peer sr-only" />
            <span className="inline-block rounded-md border border-field px-2 py-1 capitalize peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-ring">{m}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
