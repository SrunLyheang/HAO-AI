// Shared types. See context/architecture.md ("types/").
// Unit 1 introduced ChatResponse and Turn (partial); Unit 7c widened Turn
// with persistence fields (id, createdAt) and added Conversation.

/** The model's structured reply, validated at the /api/chat boundary. */
export type ChatResponse = {
  reply_zh: string; // non-empty: the tutor's spoken reply in Chinese characters
  reply_en: string; // non-empty: natural English translation of reply_zh
  correction: string; // "" when the user's input needs no correction
};

export type HskLevel = 1 | 2 | 3 | 4 | 5 | 6;

// Applied client-side via HTMLAudioElement.playbackRate (app/page.tsx) —
// ElevenLabs' own speed param is hard-limited to 0.7-1.2, too narrow for
// this range (see lib/elevenlabs-tts.ts). 0.5x/2x were tried and dropped
// for sounding too bad.
export type SpeakingRate = 0.75 | 1 | 1.5;

// Which lines of an AI turn are shown. A pure client-side display
// preference (never sent to the server) — see app/page.tsx's
// DISPLAY_SUPPORT_STORAGE_KEY, stored the same way as hsk_level.
export type DisplaySupportMode = "all" | "hanzi_pinyin" | "hanzi_only" | "audio";

/** One transcript entry as rendered by the UI. Persisted since Unit 7c —
 * `id`/`createdAt` come from the DB row (createdAt as an ISO 8601 UTC
 * string on the wire, per code-standards.md's date-handling rule). */
export type Turn =
  | { id: string; role: "user"; text_zh: string; createdAt: string }
  | {
      id: string;
      role: "ai";
      text_zh: string;
      pinyin: string; // computed by pinyin-pro, never model-supplied
      text_en: string;
      correction: string;
      correctionPinyin: string; // computed by pinyin-pro, "" when correction is ""
      createdAt: string;
    };

export type AiTurn = Extract<Turn, { role: "ai" }>;

/** A conversation row (Unit 7c). */
export type Conversation = { id: string; status: "active" | "archived"; createdAt: string };

/** The /api/transcribe success shape. */
export type TranscribeResponse = { text: string };

/** The /api/settings request/response shape (Unit 7b). */
export type Settings = { hskLevel: HskLevel };
