// Pure HSK word-list domain logic. No Next.js imports, no request handling —
// architecture.md assigns this file "loads and slices the word lists".
//
// Source: drkameleon/complete-hsk-vocabulary (MIT license), specifically
// wordlists/inclusive/old/{1..6}.min.json (the old HSK 1-6 standard). Each
// level's file is already the cumulative list up to that level, so no union
// logic is needed at runtime — see context/feature-spec/unit-2-hsk-level-control.md.

import type { HskLevel } from "@/types";
import hskWords from "@/data/hsk-words.json";

export const HSK_LEVELS: readonly HskLevel[] = [1, 2, 3, 4, 5, 6];

export function isValidHskLevel(n: unknown): n is HskLevel {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 6;
}

// Built once at module load — six Sets, cheap (max 4991 entries).
const WORD_SETS: Record<HskLevel, Set<string>> = {
  1: new Set(hskWords["1"]),
  2: new Set(hskWords["2"]),
  3: new Set(hskWords["3"]),
  4: new Set(hskWords["4"]),
  5: new Set(hskWords["5"]),
  6: new Set(hskWords["6"]),
};

// Same order as the source JSON — deterministic, byte-identical per level.
const WORD_LIST_TEXT: Record<HskLevel, string> = {
  1: hskWords["1"].join("、"),
  2: hskWords["2"].join("、"),
  3: hskWords["3"].join("、"),
  4: hskWords["4"].join("、"),
  5: hskWords["5"].join("、"),
  6: hskWords["6"].join("、"),
};

export function getCumulativeWordSet(level: HskLevel): Set<string> {
  return WORD_SETS[level];
}

export function getWordListText(level: HskLevel): string {
  return WORD_LIST_TEXT[level];
}

