// Server-only. The single place GROQ_API_KEY is read (architecture.md
// folder-ownership + invariant 1). Plain fetch, multipart/form-data — mirrors
// OpenAI's audio/transcriptions request shape, since Groq's endpoint is
// OpenAI-compatible; no SDK, matching Unit 1's DeepSeek precedent. Audio is
// passed straight through as the request body of this one call and is never
// written to disk, retained in a module-level variable, or stored anywhere
// (invariant 4).

import { fetchWithTimeout } from "./fetch-with-timeout";

const MODEL = process.env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo";
const TIMEOUT_MS = 15_000;

// Whisper occasionally decodes short/ambiguous Mandarin audio (e.g. "你好")
// as pinyin/Latin-script text instead of Hanzi — a documented Whisper quirk,
// not a Groq-specific bug. The fix is the API's `prompt` field: seeding it
// with real Chinese-character text biases the decoder's script choice toward
// Hanzi without forcing translation of genuinely non-Chinese audio (unlike
// `language`, `prompt` only nudges style/spelling, capped at 224 tokens).
const HANZI_BIAS_PROMPT = "你好，今天天气怎么样？我们用中文聊聊天吧。";

// Whisper hallucinates extra trailing tokens (a stray "B", a repeated word,
// part of the bias prompt) on the trailing-silence padding MediaRecorder
// leaves after the user releases the mic button — worse on short clips and
// with a `prompt` set, and a well-documented Whisper quirk generally.
// `verbose_json` exposes per-segment `no_speech_prob`; segments Whisper
// itself flags as silence are the hallucinated ones, so drop them instead of
// trusting the flat `text` field.
const NO_SPEECH_PROB_THRESHOLD = 0.6;

type Segment = { text?: unknown; no_speech_prob?: unknown };

export function extractTranscript(data: unknown): string {
  const segments = (data as { segments?: unknown })?.segments;
  if (Array.isArray(segments) && segments.length > 0) {
    return (segments as Segment[])
      .filter(
        (s) =>
          typeof s.no_speech_prob !== "number" ||
          s.no_speech_prob < NO_SPEECH_PROB_THRESHOLD,
      )
      .map((s) => (typeof s.text === "string" ? s.text : ""))
      .join("")
      .trim();
  }
  const text = (data as { text?: unknown })?.text;
  if (typeof text !== "string") {
    throw new Error("Groq transcription response had no text");
  }
  return text;
}

/**
 * Transcribes audio via Groq's Whisper endpoint and returns the transcript
 * string. Does not validate emptiness — that is the route's job.
 * Throws on missing key, non-2xx, or network failure — the error message
 * never contains the key.
 *
 * forceZh pins Whisper's language hint to "zh". Whisper decodes into the
 * hinted language even when the audio doesn't match it, so this is also
 * what makes spoken English come back translated into Chinese — an
 * opt-in quirk, not real translation. Omitted, Whisper auto-detects and
 * transcribes literally in whatever language was spoken.
 */
export async function transcribeAudio(
  audio: Blob,
  contentType: string,
  forceZh: boolean,
): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const form = new FormData();
  const ext = contentType.split("/")[1]?.split(";")[0] ?? "webm";
  form.append("file", audio, `audio.${ext}`);
  form.append("model", MODEL);
  form.append("prompt", HANZI_BIAS_PROMPT);
  form.append("response_format", "verbose_json");
  if (forceZh) form.append("language", "zh");

  return await fetchWithTimeout(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    },
    TIMEOUT_MS,
    "Groq transcription request",
    async (res) => {
      if (!res.ok) {
        throw new Error(
          `Groq transcription request failed: ${res.status} ${res.statusText}`,
        );
      }
      const data: unknown = await res.json();
      return extractTranscript(data);
    },
  );
}
