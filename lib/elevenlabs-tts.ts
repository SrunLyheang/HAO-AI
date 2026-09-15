// Server-only. The single place ELEVENLABS_API_KEY is read (architecture.md
// folder-ownership + invariant 1). Plain fetch to ElevenLabs' REST TTS
// endpoint, no SDK, matching Unit 1/3's precedent. Returns raw MP3 bytes —
// never decoded, cached, or persisted (invariant: "no file or blob storage
// exists in this project ... TTS audio is never stored").
//
// Switched from Azure Neural TTS on 2026-09-11 — Azure AI Speech isn't
// available in the user's country. Chosen over Groq (its only TTS models,
// orpheus-v1-english / orpheus-arabic-saudi, don't support Mandarin at all —
// a hard capability gap, not a rate-limit tradeoff) after verifying
// ElevenLabs' Multilingual v2 model explicitly covers Chinese.
//
// Speaking rate is NOT sent here — verified directly against the live API
// that this endpoint's voice_settings.speed is hard-limited to 0.7-1.2
// ("Invalid setting for speed ... received 0.5"/"received 2.0"), too narrow
// for the app's 0.5x-2x range. Rate is instead applied client-side via
// HTMLAudioElement.playbackRate (app/page.tsx), which has no such limit —
// this module always synthesizes at natural (1.0) speed.

const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const TIMEOUT_MS = 15_000;

/**
 * Synthesizes speech via ElevenLabs TTS and returns the raw MP3 bytes.
 * Throws on missing key/voice id, non-2xx, or network failure — the error
 * message never contains the key.
 */
export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({ text, model_id: MODEL_ID }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      throw new Error(`ElevenLabs TTS request failed: ${res.status} ${res.statusText}`);
    }
    return await res.arrayBuffer();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("ElevenLabs TTS request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
