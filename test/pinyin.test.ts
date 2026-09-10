import { describe, expect, it } from "vitest";
import { toPinyin } from "../lib/pinyin";

const syllables = (s: string) => toPinyin(s).split(/\s+/);

// build-spec.md Unit 1 done-criterion: correct pinyin for context-sensitive
// heteronyms 还 / 得 / 长 / 银行.
describe("toPinyin heteronyms", () => {
  const cases: [input: string, expected: string][] = [
    ["还是去吧", "hái"], // 还 = still / after all
    ["我还想去", "hái"],
    ["还不错", "hái"],
    ["把书还给你", "huán"], // 还 = return (还给 / 把...还)
    ["归还", "huán"], // dictionary word
    ["我得走了", "děi"], // 得 = must (pronoun + 得 + verb)
    ["你得去看看", "děi"],
    ["还得等一下", "děi"], // adverb 还 + 得
    ["他跑得很快", "de"], // 得 = complement particle (verb + 得 + ...)
    ["说得很好", "de"],
    ["写得不错", "de"],
    ["得到", "dé"], // 得 = obtain (kept as pinyin-pro default)
    ["很长", "cháng"],
    ["长大", "zhǎng"],
    ["去银行", "háng"], // 行 in 银行
    ["不行", "xíng"], // 行 = okay
  ];

  for (const [input, expected] of cases) {
    it(`${input} -> "${expected}"`, () => {
      expect(syllables(input)).toContain(expected);
    });
  }
});

describe("toPinyin formatting", () => {
  it("keeps punctuation, converts Han around it", () => {
    const out = toPinyin("你好，世界！");
    expect(out).toContain("nǐ");
    expect(out).toContain("hǎo");
    expect(out).toMatch(/[，！]/);
  });

  it("keeps punctuation even on the 得/还 correction path", () => {
    const out = toPinyin("他跑得很快，我得走了！");
    expect(out).toMatch(/pǎo de /);
    expect(out).toMatch(/wǒ děi /);
    expect(out).toMatch(/[，！]/);
  });

  it("uses tone marks, not tone numbers", () => {
    expect(toPinyin("中文得走")).not.toMatch(/[0-9]/);
  });
});
