import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/groq-stt";
import { ALLOWED_AUDIO_TYPES, parseTranscribeForm } from "./validate";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const parsed = parseTranscribeForm(form);
  if (!parsed) {
    const file = form.get("audio");
    let message = "Missing audio";
    if (file instanceof Blob) {
      const isAllowedType = ALLOWED_AUDIO_TYPES.some(
        (t) => file.type === t || file.type.startsWith(`${t};`),
      );
      if (!isAllowedType) message = "Unsupported audio type";
      else if (file.size <= 0) message = "Missing audio";
      else message = "Audio too large";
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let text: string;
  try {
    text = await transcribeAudio(parsed.file, parsed.contentType);
  } catch (err) {
    console.error("transcribe: Groq call failed", err);
    return NextResponse.json({ error: "Upstream unavailable" }, { status: 500 });
  }

  if (text.trim().length === 0) {
    return NextResponse.json({ error: "Could not understand audio" }, { status: 422 });
  }

  return NextResponse.json({ text });
}
