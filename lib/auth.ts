import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export class AuthError extends Error {
  constructor(
    public status: 401,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new AuthError(401, "Unauthenticated");
  return userId;
}

// Every route handler's first statement is `requireUser()` (code-standards.md),
// and every one of them needs the same AuthError -> 401 response on failure.
// This collapses that repeated try/catch to one call per route.
export async function requireUserOrResponse(): Promise<string | NextResponse> {
  try {
    return await requireUser();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
