import { describe, expect, it } from "vitest";
import { parseChatResponse } from "../app/api/chat/validate";

describe("parseChatResponse", () => {
  it("accepts a valid object with empty correction", () => {
    const raw = JSON.stringify({ reply_zh: "你好", reply_en: "Hi", correction: "" });
    expect(parseChatResponse(raw)).toEqual({
      reply_zh: "你好",
      reply_en: "Hi",
      correction: "",
    });
  });

  it("accepts a valid object with a real correction", () => {
    const raw = JSON.stringify({
      reply_zh: "你好",
      reply_en: "Hi",
      correction: "你应该说「我很好」。",
    });
    expect(parseChatResponse(raw)?.correction).toBe("你应该说「我很好」。");
  });

  it("strips a ```json markdown fence", () => {
    const raw = '```json\n{"reply_zh":"好","reply_en":"Good","correction":""}\n```';
    expect(parseChatResponse(raw)?.reply_zh).toBe("好");
  });

  it("ignores unknown extra fields", () => {
    const raw = JSON.stringify({
      reply_zh: "好",
      reply_en: "Good",
      correction: "",
      pinyin: "hǎo",
      extra: 1,
    });
    expect(parseChatResponse(raw)).toEqual({
      reply_zh: "好",
      reply_en: "Good",
      correction: "",
    });
  });

  it("rejects missing reply_zh", () => {
    expect(parseChatResponse(JSON.stringify({ reply_en: "Hi", correction: "" }))).toBeNull();
  });

  it("rejects empty reply_zh", () => {
    expect(
      parseChatResponse(JSON.stringify({ reply_zh: "", reply_en: "Hi", correction: "" })),
    ).toBeNull();
  });

  it("rejects non-string reply_en", () => {
    expect(
      parseChatResponse(JSON.stringify({ reply_zh: "你好", reply_en: 42, correction: "" })),
    ).toBeNull();
  });

  it("rejects a missing correction field (must be a string, even if empty)", () => {
    expect(
      parseChatResponse(JSON.stringify({ reply_zh: "你好", reply_en: "Hi" })),
    ).toBeNull();
  });

  it("returns null for non-JSON without throwing", () => {
    expect(parseChatResponse("sorry, I cannot do that")).toBeNull();
  });

  it("returns null for a JSON array", () => {
    expect(parseChatResponse("[1,2,3]")).toBeNull();
  });
});
