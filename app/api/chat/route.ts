import { NextResponse } from "next/server";
import { callDeepSeek, type ChatMessage } from "@/lib/deepseek";
import { toPinyin } from "@/lib/pinyin";
import type { AiTurn, Turn } from "@/types";
import { parseChatResponse } from "./validate";

// Unit 1: HSK hardcoded to 3. Unit 2 moves prompt assembly to lib/hsk.ts and
// injects the cumulative word list. Keep this a fixed constant — no per-turn
// interpolation (architecture.md invariant 8).
const SYSTEM_PROMPT = `You are a friendly Chinese conversation tutor.
Reply in short (1-2 sentence), natural, spoken-style Mandarin.
Restrict your vocabulary and grammar to roughly HSK level 3.
Always reply with a single JSON object and nothing else:
{"reply_zh": "...", "reply_en": "...", "correction": "..."}
- reply_zh: your spoken reply in Chinese characters.
- reply_en: a natural English translation of reply_zh.
- correction: if the user's most recent Chinese has grammar or wording
  mistakes, one short line with the improved sentence; otherwise "".
Do not include pinyin.`;

const MAX_MESSAGE_CHARS = 500;
const MAX_HISTORY_TURNS = 50;

type ChatRequest = { history: Turn[]; message: string };

function parseRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.message !== "string") return null;
  if (!Array.isArray(b.history)) return null;

  for (const t of b.history) {
    if (typeof t !== "object" || t === null) return null;
    const turn = t as Record<string, unknown>;
    if (turn.role !== "user" && turn.role !== "ai") return null;
    if (typeof turn.text_zh !== "string") return null;
  }

  return { history: b.history as Turn[], message: b.message };
}

function toChatMessages(history: Turn[], message: string): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map(
      (t): ChatMessage => ({
        role: t.role === "user" ? "user" : "assistant",
        content: t.text_zh,
      }),
    ),
    { role: "user", content: message },
  ];
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
  if (parsed.message.trim().length === 0) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (parsed.message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }
  if (parsed.history.length > MAX_HISTORY_TURNS) {
    return NextResponse.json({ error: "Conversation too long" }, { status: 400 });
  }

  const messages = toChatMessages(parsed.history, parsed.message);

  let raw: string;
  try {
    raw = await callDeepSeek(messages);
  } catch (err) {
    console.error("chat: DeepSeek call failed", err);
    return NextResponse.json({ error: "Upstream unavailable" }, { status: 500 });
  }

  let reply = parseChatResponse(raw);
  if (!reply) {
    // One retry with an explicit nudge, per code-standards.md.
    try {
      raw = await callDeepSeek([
        ...messages,
        { role: "user", content: "Return only the JSON object described." },
      ]);
    } catch (err) {
      console.error("chat: DeepSeek retry failed", err);
      return NextResponse.json({ error: "Upstream unavailable" }, { status: 500 });
    }
    reply = parseChatResponse(raw);
  }
  if (!reply) {
    return NextResponse.json({ error: "Bad model response" }, { status: 502 });
  }

  const turn: AiTurn = {
    role: "ai",
    text_zh: reply.reply_zh,
    pinyin: toPinyin(reply.reply_zh),
    text_en: reply.reply_en,
    correction: reply.correction,
  };
  return NextResponse.json(turn);
}
