import { NextResponse } from "next/server";
import { requireUserOrResponse } from "@/lib/auth";
import { createConversationWithGreeting, listConversations } from "@/db/queries";

export async function GET() {
  const userId = await requireUserOrResponse();
  if (userId instanceof NextResponse) return userId;

  const conversations = await listConversations(userId);
  return NextResponse.json({ conversations });
}

export async function POST() {
  const userId = await requireUserOrResponse();
  if (userId instanceof NextResponse) return userId;

  const result = await createConversationWithGreeting(userId);
  return NextResponse.json(result);
}
