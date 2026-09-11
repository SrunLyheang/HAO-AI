// Pure, HTTP-free boundary check — mirrors app/api/chat/validate.ts
// (code-standards.md §TypeScript: validate all external input at the
// boundary, reject on mismatch).

export const MAX_AUDIO_BYTES = 1 * 1024 * 1024; // 1 MB, architecture.md invariant 6
export const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
] as const;

export type ParsedAudio = { file: Blob; contentType: string };

/**
 * Parses a multipart form into a ParsedAudio, or null if the "audio" field is
 * missing, not a Blob, an unsupported type, or outside the size cap.
 * Duration is not measured here — see the feature spec for why.
 */
export function parseTranscribeForm(form: FormData): ParsedAudio | null {
  const file = form.get("audio");
  if (!(file instanceof Blob)) return null;

  const contentType = file.type;
  const isAllowedType = ALLOWED_AUDIO_TYPES.some(
    (t) => contentType === t || contentType.startsWith(`${t};`),
  );
  if (!isAllowedType) return null;

  if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) return null;

  return { file, contentType };
}
