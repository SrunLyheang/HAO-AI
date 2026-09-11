// Shared types. See context/architecture.md ("types/").
// Unit 1 introduces ChatResponse and Turn (partial). Widened in later units:
// - Unit 7 adds persistence fields (id, created_at, conversation_id)

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

/** One transcript entry as rendered by the UI. */
export type Turn =
  | { role: "user"; text_zh: string }
  | {
      role: "ai";
      text_zh: string;
      pinyin: string; // computed by pinyin-pro, never model-supplied
      text_en: string;
      correction: string;
      correctionPinyin: string; // computed by pinyin-pro, "" when correction is ""
    };

export type AiTurn = Extract<Turn, { role: "ai" }>;

/** The /api/transcribe success shape. */
export type TranscribeResponse = { text: string };
