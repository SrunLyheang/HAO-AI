import { auth } from "@clerk/nextjs/server";

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
