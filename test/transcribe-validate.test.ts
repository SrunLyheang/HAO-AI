import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES, parseTranscribeForm } from "../app/api/transcribe/validate";

function formWithBlob(bytes: number, type: string): FormData {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(bytes)], { type }), "audio");
  return form;
}

describe("parseTranscribeForm", () => {
  it("accepts a valid audio/webm blob under the size cap", () => {
    const form = formWithBlob(100, "audio/webm");
    const parsed = parseTranscribeForm(form);
    expect(parsed).not.toBeNull();
    expect(parsed?.contentType).toBe("audio/webm");
  });

  it("rejects a missing audio field", () => {
    expect(parseTranscribeForm(new FormData())).toBeNull();
  });

  it("rejects an audio field that is a plain string, not a Blob", () => {
    const form = new FormData();
    form.append("audio", "not-a-blob");
    expect(parseTranscribeForm(form)).toBeNull();
  });

  it("accepts audio/webm;codecs=opus (codec suffix present)", () => {
    const form = formWithBlob(100, "audio/webm;codecs=opus");
    expect(parseTranscribeForm(form)).not.toBeNull();
  });

  it("rejects a disallowed type (video/mp4)", () => {
    expect(parseTranscribeForm(formWithBlob(100, "video/mp4"))).toBeNull();
  });

  it("rejects a disallowed type (text/plain)", () => {
    expect(parseTranscribeForm(formWithBlob(100, "text/plain"))).toBeNull();
  });

  it("rejects a zero-byte blob", () => {
    expect(parseTranscribeForm(formWithBlob(0, "audio/webm"))).toBeNull();
  });

  it("rejects a blob one byte over the size cap", () => {
    expect(parseTranscribeForm(formWithBlob(MAX_AUDIO_BYTES + 1, "audio/webm"))).toBeNull();
  });

  it("accepts a blob exactly at the size cap", () => {
    expect(parseTranscribeForm(formWithBlob(MAX_AUDIO_BYTES, "audio/webm"))).not.toBeNull();
  });
});
