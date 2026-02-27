import { describe, expect, it } from "vitest";
import { DONUT_FROST_COLORS, pickNextDonutColor } from "../donut";

describe("pickNextDonutColor", () => {
  it("returns a valid color from the palette", () => {
    const c = pickNextDonutColor(null);
    expect(DONUT_FROST_COLORS.includes(c as (typeof DONUT_FROST_COLORS)[number])).toBe(true);
  });

  it("does not repeat the previous color consecutively", () => {
    const first = pickNextDonutColor(null);
    const second = pickNextDonutColor(first);
    expect(second).not.toBe(first);
  });

  it("never returns the same color twice in a row over many calls", () => {
    let prev: string | null = null;
    for (let i = 0; i < 100; i++) {
      const next = pickNextDonutColor(prev);
      if (prev != null) {
        expect(next).not.toBe(prev);
      }
      prev = next;
    }
  });
});

