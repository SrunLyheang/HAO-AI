import { describe, expect, it } from "vitest";
import { isMisTap, smoothLevel } from "@/components/mic-button-helpers";

describe("isMisTap", () => {
  it("is true below the ~320ms threshold", () => {
    expect(isMisTap(0)).toBe(true);
    expect(isMisTap(319)).toBe(true);
  });

  it("is false at or above the ~320ms threshold", () => {
    expect(isMisTap(320)).toBe(false);
    expect(isMisTap(1000)).toBe(false);
  });
});

describe("smoothLevel", () => {
  it("moves toward the target", () => {
    const next = smoothLevel(0, 1);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeCloseTo(0.28);
  });

  it("never overshoots the target in one call", () => {
    expect(smoothLevel(0, 1)).toBeLessThanOrEqual(1);
    expect(smoothLevel(1, 0)).toBeGreaterThanOrEqual(0);
  });
});
