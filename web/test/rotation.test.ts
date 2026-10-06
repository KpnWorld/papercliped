import { describe, expect, it } from "vitest";
import { SEASON_POOLS, type Season } from "../src/theme/palettes";
import { dayIndex, schedule, seasonalTheme, seasonOf } from "../src/theme/rotation";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const DAY = 86_400_000;
function themesFor(season: Season, year: number) {
  const start = { spring: Date.UTC(year, 2, 1), summer: Date.UTC(year, 5, 1), autumn: Date.UTC(year, 8, 1), winter: Date.UTC(year, 11, 1) }[season];
  const out: string[] = [];
  for (let t = start; seasonOf(new Date(t)).season === season; t += DAY) out.push(seasonalTheme(new Date(t)));
  return out;
}

describe("seasonal rotation", () => {
  it("is deterministic: the same date always gives the same theme", () => {
    for (const s of ["2026-03-14", "2026-07-01", "2026-10-31", "2027-01-15"]) expect(seasonalTheme(d(s))).toBe(seasonalTheme(d(s)));
    expect(schedule("spring", 2026, 92)).toEqual(schedule("spring", 2026, 92));
    expect(schedule("spring", 2026, 92)).not.toEqual(schedule("spring", 2027, 92)); // years differ
  });

  it("uses the time of day only through the UTC date", () => {
    expect(seasonalTheme(new Date("2026-04-02T00:00:01Z"))).toBe(seasonalTheme(new Date("2026-04-02T23:59:59Z")));
  });

  it("runs last 1 to 3 days and every season shows every one of its themes", () => {
    for (let year = 2024; year <= 2040; year++) {
      for (const season of ["spring", "summer", "autumn", "winter"] as Season[]) {
        const days = themesFor(season, year);
        let run = 1;
        for (let i = 1; i < days.length; i++) {
          run = days[i] === days[i - 1] ? run + 1 : 1;
          expect(run, `${season} ${year} day ${i}`).toBeLessThanOrEqual(3);
        }
        for (const t of SEASON_POOLS[season]) expect(days, `${season} ${year}`).toContain(t);
        expect(new Set(days)).toEqual(new Set(SEASON_POOLS[season])); // and nothing from other seasons
      }
    }
  });

  it("season boundaries and winter across the new year", () => {
    expect(seasonOf(d("2026-02-28")).season).toBe("winter");
    expect(seasonOf(d("2026-03-01")).season).toBe("spring");
    expect(seasonOf(d("2026-05-31")).season).toBe("spring");
    expect(seasonOf(d("2026-06-01")).season).toBe("summer");
    expect(seasonOf(d("2026-11-30")).season).toBe("autumn");
    expect(seasonOf(d("2026-12-01"))).toMatchObject({ season: "winter", year: 2026 });
    expect(seasonOf(d("2027-01-01"))).toMatchObject({ season: "winter", year: 2026 });
    expect(dayIndex(d("2026-12-01"))).toBe(0);
    expect(dayIndex(d("2027-01-01"))).toBe(31); // continuous across the new year
    expect(dayIndex(d("2026-03-01"))).toBe(0);
  });

  it("leap day is a normal winter day", () => {
    expect(seasonOf(d("2028-02-29"))).toMatchObject({ season: "winter", year: 2027 });
    expect(dayIndex(d("2028-02-29"))).toBe(dayIndex(d("2028-02-28")) + 1);
    expect(dayIndex(d("2028-02-29"))).toBe(90);
    expect(seasonOf(d("2028-03-01")).season).toBe("spring");
    expect(SEASON_POOLS.winter).toContain(seasonalTheme(d("2028-02-29")));
  });
});
