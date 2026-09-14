import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs-tts";
import { requireUserOrResponse } from "@/lib/auth";
import { parseSpeakRequest } from "./validate";

export async function POST(req: Request) {
  const authResult = await requireUserOrResponse();
  if (authResult instanceof NextResponse) return authResult;

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

  let audio: ArrayBuffer;
  try {
    audio = await synthesizeSpeech(parsed.text);
  } catch (err) {
    console.error("speak: ElevenLabs TTS call failed", err);
    return NextResponse.json({ error: "Upstream unavailable" }, { status: 500 });
  }

  return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg" } });
}
