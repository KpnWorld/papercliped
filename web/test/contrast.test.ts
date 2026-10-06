import { describe, expect, it } from "vitest";
import { contrast } from "../src/theme/contrast";
import { PALETTES, type Tokens } from "../src/theme/palettes";

// WCAG 2.x AA: body text 4.5:1; UI components and focus indicators 3:1.
const TEXT: [keyof Tokens, keyof Tokens][] = [["ink", "bg"], ["ink", "surface"], ["muted", "bg"], ["muted", "surface"], ["link", "bg"], ["link", "surface"], ["accentInk", "accent"]];
const UI: [keyof Tokens, keyof Tokens][] = [["field", "bg"], ["field", "surface"], ["ring", "bg"], ["ring", "surface"], ["accent", "bg"], ["accent", "surface"]];

describe("every theme x mode meets WCAG AA", () => {
  for (const p of Object.values(PALETTES)) {
    for (const mode of ["light", "dark"] as const) {
      const t = p[mode];
      it(`${p.id} ${mode}`, () => {
        const fails: string[] = [];
        for (const [a, b] of TEXT) if (contrast(t[a], t[b]) < 4.5) fails.push(`text ${a}/${b} ${contrast(t[a], t[b]).toFixed(2)}`);
        for (const [a, b] of UI) if (contrast(t[a], t[b]) < 3) fails.push(`ui ${a}/${b} ${contrast(t[a], t[b]).toFixed(2)}`);
        expect(fails).toEqual([]);
      });
    }
  }
  it("the contrast maths is right", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});
