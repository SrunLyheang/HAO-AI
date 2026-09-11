// Server-only. The single place GROQ_API_KEY is read (architecture.md
// folder-ownership + invariant 1). Plain fetch, multipart/form-data — mirrors
// OpenAI's audio/transcriptions request shape, since Groq's endpoint is
// OpenAI-compatible; no SDK, matching Unit 1's DeepSeek precedent. Audio is
// passed straight through as the request body of this one call and is never
// written to disk, retained in a module-level variable, or stored anywhere
// (invariant 4).

const MODEL = process.env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo";

/**
 * Transcribes audio via Groq's Whisper endpoint and returns the transcript
 * string. Does not validate emptiness — that is the route's job.
 * Throws on missing key, non-2xx, or network failure — the error message
 * never contains the key.
 */
export async function transcribeAudio(audio: Blob, contentType: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const form = new FormData();
  const ext = contentType.split("/")[1]?.split(";")[0] ?? "webm";
  form.append("file", audio, `audio.${ext}`);
  form.append("model", MODEL);
  form.append("language", "zh");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Groq transcription request failed: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  const text = (data as { text?: unknown })?.text;
  if (typeof text !== "string") {
    throw new Error("Groq transcription response had no text");
  }
  return text;
}
