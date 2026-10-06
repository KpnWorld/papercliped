import { SEASON_POOLS, type Season, type ThemeId } from "./palettes";

const DAY = 86_400_000;

/** Meteorological seasons on the UTC calendar: spring Mar-May, summer Jun-Aug, autumn Sep-Nov, winter Dec-Feb. */
export function seasonOf(date: Date): { season: Season; year: number; start: number } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0 = January
  if (m >= 2 && m <= 4) return { season: "spring", year: y, start: Date.UTC(y, 2, 1) };
  if (m >= 5 && m <= 7) return { season: "summer", year: y, start: Date.UTC(y, 5, 1) };
  if (m >= 8 && m <= 10) return { season: "autumn", year: y, start: Date.UTC(y, 8, 1) };
  const wy = m === 11 ? y : y - 1; // winter belongs to the year it starts in (December)
  return { season: "winter", year: wy, start: Date.UTC(wy, 11, 1) };
}

/** Days since the season started (0 on its first UTC day). */
export function dayIndex(date: Date): number {
  const { start } = seasonOf(date);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((today - start) / DAY);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Run {
  theme: ThemeId;
  days: number;
}

/**
 * The season's schedule: rounds in which every palette of the pool appears once, in a seeded random order, for 1 to 3 days.
 * The same (year, season) always gives the same schedule, so everyone sees the same theme on a given UTC date, with no server.
 * A round never starts with the theme that ended the previous one, so no run is longer than 3 days.
 */
export function schedule(season: Season, year: number, minDays: number): Run[] {
  const rng = mulberry32(hash(`papercliped:${year}:${season}`));
  const pool = SEASON_POOLS[season];
  const runs: Run[] = [];
  let total = 0;
  while (total < minDays) {
    const order = [...pool];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (runs.length && order[0] === runs[runs.length - 1].theme) [order[0], order[1]] = [order[1], order[0]];
    for (const theme of order) {
      const days = 1 + Math.floor(rng() * 3);
      runs.push({ theme, days });
      total += days;
    }
  }
  return runs;
}

/** The theme everyone sees on this UTC date when following the season. */
export function seasonalTheme(date: Date = new Date()): ThemeId {
  const { season, year } = seasonOf(date);
  const idx = dayIndex(date);
  let acc = 0;
  for (const r of schedule(season, year, idx + 1)) {
    acc += r.days;
    if (idx < acc) return r.theme;
  }
  return "clip"; // unreachable: the schedule always covers idx
}
