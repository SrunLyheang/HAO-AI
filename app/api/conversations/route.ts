import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { createConversationWithGreeting, listConversations } from "@/db/queries";

export async function GET() {
  try {
    const userId = await requireUser();
    const conversations = await listConversations(userId);
    return NextResponse.json({ conversations });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function POST() {
  try {
    const userId = await requireUser();
    const result = await createConversationWithGreeting(userId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
