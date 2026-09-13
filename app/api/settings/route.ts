import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { isValidHskLevel } from "@/lib/hsk";
import { getSettings, upsertHskLevel } from "@/db/queries";

export async function GET() {
  try {
    const userId = await requireUser();
    const result = await getSettings(userId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await requireUser();

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
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
