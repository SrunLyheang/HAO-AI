// Server-only. The single place DEEPSEEK_API_KEY is read (architecture.md
// invariant 1, folder ownership). No parsing/validation here — the /api/chat
// route validates the returned string against ChatResponse and owns the retry.

import { fetchWithTimeout } from "./fetch-with-timeout";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const TIMEOUT_MS = 15_000;

/**
 * Calls DeepSeek's OpenAI-compatible chat-completions endpoint and returns the
 * raw assistant message content (expected to be a JSON string).
 * Throws on missing key, non-2xx, network failure, or an empty choice — the
 * error message never contains the key.
 */
export async function callDeepSeek(messages: ChatMessage[]): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");

  const res = await fetchWithTimeout(
    `${BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    },
    TIMEOUT_MS,
    "DeepSeek request",
  );
  if (!res.ok) {
    throw new Error(
      `DeepSeek request failed: ${res.status} ${res.statusText}`,
    );
  }
  const data: unknown = await res.json();
  const content = (
    data as { choices?: { message?: { content?: unknown } }[] }
  )?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("DeepSeek response had no message content");
  }
  return content;
}

/**
 * Summarizes a conversation's opening user message into a short Chinese
 * title for the history list. Throws on any failure — callers treat this as
 * best-effort and fall back to the raw message preview.
 */
export async function generateConversationTitle(
  userMessage: string,
): Promise<string> {
  const raw = await callDeepSeek([
    {
      role: "system",
      content:
        "Summarize the topic of the user's message in 3-6 Chinese characters (简体中文), " +
        "for a chat history list title. Name the actual subject discussed — " +
        'never describe the user\'s state or mood (e.g. not "用户很饿"). ' +
        "No punctuation, no quotes. " +
        'Respond as JSON: {"title": "..."}.',
    },
    { role: "user", content: userMessage },
  ]);
  const parsed: unknown = JSON.parse(raw);
  const title = (parsed as { title?: unknown } | null)?.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("DeepSeek title response had no title");
  }
  return title.trim().slice(0, 60);
}
