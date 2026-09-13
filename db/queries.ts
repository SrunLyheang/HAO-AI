import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { settings } from "@/db/schema";
import type { HskLevel } from "@/types";

export async function getSettings(userId: string): Promise<{ hskLevel: HskLevel }> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  return { hskLevel: (row?.hskLevel as HskLevel | undefined) ?? 3 };
}

export async function upsertHskLevel(userId: string, hskLevel: HskLevel): Promise<void> {
  await db
    .insert(settings)
    .values({ userId, hskLevel, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { hskLevel, updatedAt: new Date() },
    });
}
