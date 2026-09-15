import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs-tts";
import { requireUserOrResponse } from "@/lib/auth";
import { reserveUsage } from "@/lib/ratelimit";
import { parseSpeakRequest } from "./validate";

export async function POST(req: Request) {
  const authResult = await requireUserOrResponse();
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseSpeakRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  if (!(await reserveUsage(userId, "speak"))) {
    return NextResponse.json({ error: "Rate limit reached; try again later." }, { status: 429 });
  }

  let audio: ArrayBuffer;
  try {
    audio = await synthesizeSpeech(parsed.text);
  } catch (err) {
    console.error("speak: ElevenLabs TTS call failed", err);
    return NextResponse.json({ error: "Upstream unavailable" }, { status: 500 });
  }

  return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg" } });
}
