import type { ChatResponse, HskLevel, Turn } from "@/types";
import { isValidHskLevel } from "@/lib/hsk";

export type ChatRequest = { history: Turn[]; message: string; hskLevel: HskLevel };

/**
 * Parses a raw request body into a ChatRequest, or null if it is not valid.
 * External input — validated explicitly, never cast (code-standards.md).
 */
export function parseChatRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.message !== "string") return null;
  if (!Array.isArray(b.history)) return null;
  if (!isValidHskLevel(b.hskLevel)) return null;

  for (const t of b.history) {
    if (typeof t !== "object" || t === null) return null;
    const turn = t as Record<string, unknown>;
    if (turn.role !== "user" && turn.role !== "ai") return null;
    if (typeof turn.text_zh !== "string") return null;
  }

  return { history: b.history as Turn[], message: b.message, hskLevel: b.hskLevel };
}

/**
 * Parses a raw model string into a ChatResponse, or null if it is not valid.
 * External input — validated explicitly, never cast (code-standards.md).
 *
 * Accepts a bare JSON object or one wrapped in a ```json ... ``` markdown
 * fence (models emit fences often even when asked not to). Unknown extra
 * fields are ignored. Never throws.
 */
export function parseChatResponse(raw: string): ChatResponse | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(stripped);
  } catch {
    return null;
  }

  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  if (typeof o.reply_zh !== "string" || o.reply_zh.length === 0) return null;
  if (typeof o.reply_en !== "string" || o.reply_en.length === 0) return null;
  if (typeof o.correction !== "string") return null;

  return { reply_zh: o.reply_zh, reply_en: o.reply_en, correction: o.correction };
}
