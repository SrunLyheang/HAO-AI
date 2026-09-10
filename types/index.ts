// Shared types. See context/architecture.md ("types/").
// Unit 1 introduces ChatResponse and Turn (partial). Widened in later units:
// - Unit 2 adds above-level word flagging
// - Unit 7 adds persistence fields (id, created_at, conversation_id)

/** The model's structured reply, validated at the /api/chat boundary. */
export type ChatResponse = {
  reply_zh: string; // non-empty: the tutor's spoken reply in Chinese characters
  reply_en: string; // non-empty: natural English translation of reply_zh
  correction: string; // "" when the user's input needs no correction
};

/** One transcript entry as rendered by the UI. */
export type Turn =
  | { role: "user"; text_zh: string }
  | {
      role: "ai";
      text_zh: string;
      pinyin: string; // computed by pinyin-pro, never model-supplied
      text_en: string;
      correction: string;
    };

export type AiTurn = Extract<Turn, { role: "ai" }>;
