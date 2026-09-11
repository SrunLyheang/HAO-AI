import { describe, expect, it } from "vitest";
import { MAX_SPEAK_TEXT_LENGTH, parseSpeakRequest } from "../app/api/speak/validate";

describe("parseSpeakRequest", () => {
  it("accepts a valid body", () => {
    expect(parseSpeakRequest({ text: "你好" })).toEqual({ text: "你好" });
  });

  it("rejects a missing text field", () => {
    expect(parseSpeakRequest({})).toBeNull();
  });

  it("rejects an empty text string", () => {
    expect(parseSpeakRequest({ text: "" })).toBeNull();
  });

  it("rejects a whitespace-only text string", () => {
    expect(parseSpeakRequest({ text: "   " })).toBeNull();
  });

  it("accepts text exactly at MAX_SPEAK_TEXT_LENGTH", () => {
    const text = "a".repeat(MAX_SPEAK_TEXT_LENGTH);
    expect(parseSpeakRequest({ text })).not.toBeNull();
  });

  it("rejects text one char over MAX_SPEAK_TEXT_LENGTH", () => {
    const text = "a".repeat(MAX_SPEAK_TEXT_LENGTH + 1);
    expect(parseSpeakRequest({ text })).toBeNull();
  });

  it("rejects a wrong-type text", () => {
    expect(parseSpeakRequest({ text: 123 })).toBeNull();
  });

  it("ignores extra unknown fields", () => {
    expect(parseSpeakRequest({ text: "你好", rate: 2 })).toEqual({ text: "你好" });
  });
});
