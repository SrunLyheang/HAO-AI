import { describe, expect, it } from "vitest";
import { parseChatRequest, parseChatResponse } from "../app/api/chat/validate";

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

describe("parseChatRequest", () => {
  it("accepts a valid request at hskLevel 1 (boundary)", () => {
    expect(parseChatRequest({ history: [], message: "你好", hskLevel: 1 })).toEqual({
      history: [],
      message: "你好",
      hskLevel: 1,
    });
  });

  it("accepts a valid request at hskLevel 6 (boundary)", () => {
    expect(parseChatRequest({ history: [], message: "你好", hskLevel: 6 })).toEqual({
      history: [],
      message: "你好",
      hskLevel: 6,
    });
  });

  it("rejects a missing hskLevel", () => {
    expect(parseChatRequest({ history: [], message: "你好" })).toBeNull();
  });

  it.each([0, 7, 3.5, "3"])("rejects hskLevel %p", (hskLevel) => {
    expect(parseChatRequest({ history: [], message: "你好", hskLevel })).toBeNull();
  });

  it("rejects missing message (regression)", () => {
    expect(parseChatRequest({ history: [], hskLevel: 3 })).toBeNull();
  });

  it("rejects non-array history (regression)", () => {
    expect(parseChatRequest({ history: "nope", message: "你好", hskLevel: 3 })).toBeNull();
  });

  it("rejects a malformed history turn (regression)", () => {
    expect(
      parseChatRequest({ history: [{ role: "bogus", text_zh: "x" }], message: "你好", hskLevel: 3 }),
    ).toBeNull();
  });

  it("accepts a non-empty history (regression)", () => {
    const history = [{ role: "user" as const, text_zh: "你好" }];
    expect(parseChatRequest({ history, message: "再见", hskLevel: 3 })).toEqual({
      history,
      message: "再见",
      hskLevel: 3,
    });
  });
});
