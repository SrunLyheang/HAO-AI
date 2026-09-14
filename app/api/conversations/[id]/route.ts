import { NextResponse } from "next/server";
import { requireUserOrResponse } from "@/lib/auth";
import { deleteConversation, getConversationTurns } from "@/db/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserOrResponse();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const turns = await getConversationTurns(userId, id);
  if (turns === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ turns });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserOrResponse();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const deleted = await deleteConversation(userId, id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
