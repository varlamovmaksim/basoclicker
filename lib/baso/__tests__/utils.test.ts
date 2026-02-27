import { describe, expect, it } from "vitest";
import { clamp, formatCompact } from "../utils";

describe("clamp", () => {
  it("returns value in range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps low values", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it("clamps high values", () => {
    expect(clamp(999, 0, 10)).toBe(10);
  });
});

describe("formatCompact", () => {
  it("returns plain number for small values", () => {
    expect(formatCompact(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    const v = formatCompact(1_234);
    expect(v.endsWith("K")).toBe(true);
  });

  it("formats millions with M suffix", () => {
    const v = formatCompact(2_500_000);
    expect(v.endsWith("M")).toBe(true);
  });
}
);

