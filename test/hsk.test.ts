import { describe, expect, it } from "vitest";
import { getCumulativeWordSet, getWordListText, isValidHskLevel } from "../lib/hsk";
import type { HskLevel } from "../types";

// +1 per level vs. the raw upstream counts: "说" is manually patched in
// (see data/hsk-words.json) — the old-standard list omits it standalone,
// only inside compounds (说话/说明/...).
const COUNTS: Record<HskLevel, number> = {
  1: 151,
  2: 298,
  3: 596,
  4: 1194,
  5: 2492,
  6: 4992,
};

describe("getCumulativeWordSet", () => {
  for (const level of [1, 2, 3, 4, 5, 6] as HskLevel[]) {
    it(`level ${level} has the confirmed cumulative count`, () => {
      expect(getCumulativeWordSet(level).size).toBe(COUNTS[level]);
    });
  }

  it("each level's set is a subset of the next level's (cumulative, monotonic)", () => {
    for (let level = 1; level < 6; level++) {
      const lower = getCumulativeWordSet(level as HskLevel);
      const higher = getCumulativeWordSet((level + 1) as HskLevel);
      for (const word of lower) {
        expect(higher.has(word)).toBe(true);
      }
    }
  });
});

describe("getWordListText", () => {
  it("is byte-identical across calls for the same level", () => {
    expect(getWordListText(3)).toBe(getWordListText(3));
  });

  it("differs between levels", () => {
    expect(getWordListText(1)).not.toBe(getWordListText(5));
  });
});

describe("isValidHskLevel", () => {
  it.each([1, 2, 3, 4, 5, 6])("accepts %p", (n) => {
    expect(isValidHskLevel(n)).toBe(true);
  });

  it.each([0, 7, 3.5, "3", null, undefined])("rejects %p", (n) => {
    expect(isValidHskLevel(n)).toBe(false);
  });
});
