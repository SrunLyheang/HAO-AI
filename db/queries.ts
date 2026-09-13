import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db/index";
import { conversations, settings, turns } from "@/db/schema";
import type { Conversation, HskLevel, Turn } from "@/types";

const MAX_CONVERSATIONS_PER_USER = 50;

// Carried over unchanged from the pre-Unit-7c hardcoded client-side
// GREETING constant (app/page.tsx) — never model-supplied, no per-level
// variation (not requested, not in scope).
const GREETING_ZH = "你好！今天想聊什么？";
const GREETING_PINYIN = "nǐ hǎo！jīn tiān xiǎng liáo shén me？";
const GREETING_EN = "Hi! What would you like to talk about today?";

function toConversation(row: typeof conversations.$inferSelect): Conversation {
  return { id: row.id, status: row.status, createdAt: row.createdAt.toISOString() };
}

function toTurn(row: typeof turns.$inferSelect): Turn {
  if (row.role === "user") {
    return { id: row.id, role: "user", text_zh: row.textZh, createdAt: row.createdAt.toISOString() };
  }
  return {
    id: row.id,
    role: "ai",
    text_zh: row.textZh,
    pinyin: row.pinyin ?? "",
    text_en: row.textEn ?? "",
    correction: row.correction ?? "",
    correctionPinyin: row.correctionPinyin ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getOrCreateActiveConversation(
  userId: string,
): Promise<{ conversation: Conversation; turns: Turn[] }> {
  const existing = await db.query.conversations.findFirst({
    where: and(eq(conversations.userId, userId), eq(conversations.status, "active")),
  });
  if (existing) {
    const rows = await db.query.turns.findMany({
      where: eq(turns.conversationId, existing.id),
      orderBy: asc(turns.createdAt),
    });
    return { conversation: toConversation(existing), turns: rows.map(toTurn) };
  }
  return createConversationWithGreeting(userId);
}

// The neon-http driver has no interactive (BEGIN/COMMIT-across-round-trips)
// transactions — db.batch() is its one atomic unit (a single HTTP call to
// Neon's transaction endpoint), so every write that must land together goes
// in one batch call. Reads that only decide *what* to batch (the count,
// the oldest row) run beforehand; a race there can at worst skip pruning
// one extra row on a rare concurrent double-create — it cannot violate the
// one-active-conversation invariant, which the DB's own partial unique
// index (conversations_one_active_per_user) enforces regardless.
async function createConversationWithGreeting(
  userId: string,
): Promise<{ conversation: Conversation; turns: Turn[] }> {
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(conversations)
    .where(eq(conversations.userId, userId));

  let oldestId: string | undefined;
  if (total >= MAX_CONVERSATIONS_PER_USER) {
    const oldest = await db.query.conversations.findFirst({
      where: eq(conversations.userId, userId),
      orderBy: asc(conversations.createdAt),
    });
    oldestId = oldest?.id;
  }

  const conversationId = crypto.randomUUID();
  const turnId = crypto.randomUUID();
  const now = new Date();

  const archiveQuery = db
    .update(conversations)
    .set({ status: "archived" })
    .where(and(eq(conversations.userId, userId), eq(conversations.status, "active")));
  const insertConvQuery = db
    .insert(conversations)
    .values({ id: conversationId, userId, status: "active", createdAt: now });
  const insertTurnQuery = db.insert(turns).values({
    id: turnId,
    conversationId,
    userId,
    role: "ai",
    textZh: GREETING_ZH,
    pinyin: GREETING_PINYIN,
    textEn: GREETING_EN,
    correction: "",
    correctionPinyin: "",
    createdAt: now,
  });

  if (oldestId) {
    await db.batch([
      archiveQuery,
      insertConvQuery,
      insertTurnQuery,
      db.delete(conversations).where(eq(conversations.id, oldestId)),
    ]);
  } else {
    await db.batch([archiveQuery, insertConvQuery, insertTurnQuery]);
  }

  return {
    conversation: { id: conversationId, status: "active", createdAt: now.toISOString() },
    turns: [
      {
        id: turnId,
        role: "ai",
        text_zh: GREETING_ZH,
        pinyin: GREETING_PINYIN,
        text_en: GREETING_EN,
        correction: "",
        correctionPinyin: "",
        createdAt: now.toISOString(),
      },
    ],
  };
}

export async function appendTurnPair(
  userId: string,
  conversationId: string,
  userTurn: { text_zh: string },
  aiTurn: {
    text_zh: string;
    pinyin: string;
    text_en: string;
    correction: string;
    correctionPinyin: string;
  },
): Promise<Turn> {
  const now = new Date();
  const aiTurnId = crypto.randomUUID();

  await db.batch([
    db.insert(turns).values({
      id: crypto.randomUUID(),
      conversationId,
      userId,
      role: "user",
      textZh: userTurn.text_zh,
      createdAt: now,
    }),
    db.insert(turns).values({
      id: aiTurnId,
      conversationId,
      userId,
      role: "ai",
      textZh: aiTurn.text_zh,
      pinyin: aiTurn.pinyin,
      textEn: aiTurn.text_en,
      correction: aiTurn.correction,
      correctionPinyin: aiTurn.correctionPinyin,
      createdAt: now,
    }),
  ]);

  return {
    id: aiTurnId,
    role: "ai",
    text_zh: aiTurn.text_zh,
    pinyin: aiTurn.pinyin,
    text_en: aiTurn.text_en,
    correction: aiTurn.correction,
    correctionPinyin: aiTurn.correctionPinyin,
    createdAt: now.toISOString(),
  };
}

export async function countTurns(userId: string, conversationId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(turns)
    .where(and(eq(turns.userId, userId), eq(turns.conversationId, conversationId)));
  return value;
}

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
