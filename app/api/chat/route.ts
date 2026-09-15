import { NextResponse, after } from "next/server";
import { callDeepSeek, generateConversationTitle, type ChatMessage } from "@/lib/deepseek";
import { toPinyin } from "@/lib/pinyin";
import { requireUserOrResponse } from "@/lib/auth";
import { reserveUsage } from "@/lib/ratelimit";
import {
  appendTurnPair,
  ConversationNotFoundError,
  countTurns,
  setConversationTitle,
} from "@/db/queries";
import type { HskLevel, Turn } from "@/types";
import { parseChatRequest, parseChatResponse } from "./validate";
import { buildSystemPrompt } from "./prompt";

const MAX_MESSAGE_CHARS = 500;
const MAX_HISTORY_TURNS = 50;
const MAX_TURNS_PER_CONVERSATION = 25;

function toChatMessages(
  history: Turn[],
  message: string,
  hskLevel: HskLevel,
): ChatMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(hskLevel) },
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
  const userId = await requireUserOrResponse();
  if (userId instanceof NextResponse) return userId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseChatRequest(body);
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
    return NextResponse.json(
      { error: "Conversation too long" },
      { status: 400 },
    );
  }

  const existingTurns = await countTurns(userId, parsed.conversationId);
  if (existingTurns >= MAX_TURNS_PER_CONVERSATION) {
    return NextResponse.json(
      { error: "Conversation is full" },
      { status: 400 },
    );
  }

  if (!(await reserveUsage(userId, "chat"))) {
    return NextResponse.json(
      { error: "Rate limit reached; try again later." },
      { status: 429 },
    );
  }

  const messages = toChatMessages(
    parsed.history,
    parsed.message,
    parsed.hskLevel,
  );

  let raw: string;
  try {
    raw = await callDeepSeek(messages);
  } catch (err) {
    console.error("chat: DeepSeek call failed", err);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 500 },
    );
  }

  let reply = parseChatResponse(raw);
  if (!reply) {
    // One retry with an explicit nudge, per code-standards.md.
    if (!(await reserveUsage(userId, "chat"))) {
      return NextResponse.json(
        { error: "Rate limit reached; try again later." },
        { status: 429 },
      );
    }
    try {
      raw = await callDeepSeek([
        ...messages,
        { role: "user", content: "Return only the JSON object described." },
      ]);
    } catch (err) {
      console.error("chat: DeepSeek retry failed", err);
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 500 },
      );
    }
    reply = parseChatResponse(raw);
  }
  if (!reply) {
    return NextResponse.json({ error: "Bad model response" }, { status: 502 });
  }

  let aiTurn;
  try {
    aiTurn = await appendTurnPair(
      userId,
      parsed.conversationId,
      { text_zh: parsed.message },
      {
        text_zh: reply.reply_zh,
        pinyin: toPinyin(reply.reply_zh),
        text_en: reply.reply_en,
        correction: reply.correction,
        correctionPinyin:
          reply.correction === "" ? "" : toPinyin(reply.correction),
      },
    );
  } catch (e) {
    if (e instanceof ConversationNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    throw e;
  }

  // existingTurns === 1 means only the greeting existed before this call,
  // i.e. this was the conversation's first user message — the one and only
  // point a title gets generated. Runs after the response so it never adds
  // latency; best-effort, a failure here just leaves the title null.
  if (existingTurns === 1) {
    after(async () => {
      try {
        const title = await generateConversationTitle(parsed.message);
        await setConversationTitle(userId, parsed.conversationId, title);
      } catch (err) {
        console.error("chat: title generation failed", err);
      }
    });
  }

  return NextResponse.json(aiTurn);
}
