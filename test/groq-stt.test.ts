import { describe, expect, it } from "vitest";
import { extractTranscript } from "../lib/groq-stt";

describe("extractTranscript", () => {
  it("drops a hallucinated trailing segment flagged as silence", () => {
    const data = {
      segments: [
        { text: "你好", no_speech_prob: 0.05 },
        { text: " B", no_speech_prob: 0.92 },
      ],
    };
    expect(extractTranscript(data)).toBe("你好");
  });

  it("keeps real multi-segment speech", () => {
    const data = {
      segments: [
        { text: "你好，", no_speech_prob: 0.02 },
        { text: "今天天气怎么样？", no_speech_prob: 0.01 },
      ],
    };
    expect(extractTranscript(data)).toBe("你好，今天天气怎么样？");
  });

  it("falls back to the flat text field when there are no segments", () => {
    expect(extractTranscript({ text: "你好" })).toBe("你好");
  });

  it("throws when neither segments nor text are present", () => {
    expect(() => extractTranscript({})).toThrow();
  });
});
