import { pinyin } from "pinyin-pro";

/**
 * Deterministic Hanzi -> pinyin. Tone marks, space-separated syllables,
 * non-Chinese characters (punctuation, digits) passed through unchanged.
 *
 * pinyin-pro's word segmentation already disambiguates most heteronyms
 * (长 cháng/zhǎng, 行 háng/xíng, adverbial 还 hái, dictionary 还-words huán).
 * It does NOT get context 得 or transitive 还, which the build-spec names as
 * spot-checks, so a small correction pass fixes the common conversational
 * cases below.
 *
 * ponytail: heuristic 得/还 fix, not a parser. Ceilings —
 *   - bare transitive 还 without 给/把 (还书, 我还你钱) still reads hái
 *   - 得 as a bound "obtain" morpheme outside OBTAIN_NEXT may misread
 * Upgrade path: replace with a POS-tagged pass if pinyin accuracy needs it.
 *
 * architecture.md invariant 5: pinyin shown to the user is always computed
 * here, never taken from the model.
 */

// Chars that, immediately before a standalone 得, mark it as the modal děi
// (pronoun / adverb + 得 + verb): 我得走, 你得去, 还得等, 就得这样.
const DE_MUST_PREV = new Set("我你他她它咱谁们还就也总都非必");
// Chars right after 得 that keep it as dé ("obtain"): 得到, 得意, 得分...
const DE_OBTAIN_NEXT = new Set("到意分力罪益失");

type PinyinItem = { origin: string; result: string; isZh: boolean };

function fixDe(items: PinyinItem[], i: number): string {
  const prev = items[i - 1];
  const next = items[i + 1];
  if (prev?.isZh && DE_MUST_PREV.has(prev.origin)) return "děi";
  if (
    prev?.isZh &&
    next?.isZh &&
    prev.origin !== "不" &&
    !DE_OBTAIN_NEXT.has(next.origin)
  ) {
    return "de";
  }
  return items[i].result;
}

function fixHuan(items: PinyinItem[], i: number): string {
  const prev = items[i - 1];
  const next = items[i + 1];
  if (next?.origin === "给" || prev?.origin === "把") return "huán";
  return items[i].result;
}

export function toPinyin(hanzi: string): string {
  if (!hanzi.includes("得") && !hanzi.includes("还")) {
    return pinyin(hanzi, { toneType: "symbol", nonZh: "consecutive" });
  }

  const items = pinyin(hanzi, { toneType: "symbol", type: "all" }) as PinyinItem[];
  const syllables = items.map((it, i) => {
    if (!it.isZh) return it.origin;
    if (it.origin === "得") return fixDe(items, i);
    if (it.origin === "还") return fixHuan(items, i);
    return it.result;
  });

  // Join: single space between two Han syllables; no space touching a
  // non-Han char. Matches pinyin-pro's own `nonZh: "consecutive"` output.
  let out = "";
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && items[i - 1].isZh && items[i].isZh) out += " ";
    out += syllables[i];
  }
  return out;
}
