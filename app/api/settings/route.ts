import { NextResponse } from "next/server";
import { requireUserOrResponse } from "@/lib/auth";
import { isValidHskLevel } from "@/lib/hsk";
import { getSettings, upsertHskLevel } from "@/db/queries";

export async function GET() {
  const userId = await requireUserOrResponse();
  if (userId instanceof NextResponse) return userId;

  const result = await getSettings(userId);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const userId = await requireUserOrResponse();
  if (userId instanceof NextResponse) return userId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hskLevel = (body as { hskLevel?: unknown } | null)?.hskLevel;
  if (!isValidHskLevel(hskLevel)) {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  await upsertHskLevel(userId, hskLevel);
  return NextResponse.json({ hskLevel });
}
