// Pure, HTTP-free boundary check — mirrors app/api/chat/validate.ts and
// app/api/transcribe/validate.ts (code-standards.md §TypeScript: validate
// all external input at the boundary, reject on mismatch).
//
// No `rate` field — speaking rate is applied client-side via
// HTMLAudioElement.playbackRate (see lib/elevenlabs-tts.ts for why), so the
// server never needs it.

export const MAX_SPEAK_TEXT_LENGTH = 500; // matches the existing text cap, code-standards.md §API Routes

export type SpeakRequest = { text: string };

/**
 * Parses a raw request body into a SpeakRequest, or null if it is not valid.
 * External input — validated explicitly, never cast (code-standards.md).
 */
export function parseSpeakRequest(body: unknown): SpeakRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.text !== "string") return null;
  const trimmed = b.text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SPEAK_TEXT_LENGTH) return null;

  return { text: b.text };
}
