// Server-only. The single place DEEPSEEK_API_KEY is read (architecture.md
// invariant 1, folder ownership). No parsing/validation here — the /api/chat
// route validates the returned string against ChatResponse and owns the retry.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

/**
 * Calls DeepSeek's OpenAI-compatible chat-completions endpoint and returns the
 * raw assistant message content (expected to be a JSON string).
 * Throws on missing key, non-2xx, network failure, or an empty choice — the
 * error message never contains the key.
 */
export async function callDeepSeek(messages: ChatMessage[]): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
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
  });

  if (!res.ok) {
    throw new Error(`DeepSeek request failed: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  const content = (data as { choices?: { message?: { content?: unknown } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("DeepSeek response had no message content");
  }
  return content;
}
