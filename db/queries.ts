import { and, asc, desc, eq, count } from "drizzle-orm";
import { db } from "@/db/index";
import { conversations, settings, turns } from "@/db/schema";
import type {
  Conversation,
  ConversationSummary,
  HskLevel,
  Turn,
} from "@/types";

const MAX_CONVERSATIONS_PER_USER = 50;

// Carried over unchanged from the pre-Unit-7c hardcoded client-side
// GREETING constant (app/page.tsx) — never model-supplied, no per-level
// variation (not requested, not in scope).
const GREETING_ZH = "你好！今天想聊什么？";
const GREETING_PINYIN = "nǐ hǎo！jīn tiān xiǎng liáo shén me？";
const GREETING_EN = "Hi! What would you like to talk about today?";

function isActiveConversationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    (!("constraint" in error) ||
      error.constraint === "conversations_one_active_per_user")
  );
}

function toConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTurn(row: typeof turns.$inferSelect): Turn {
  if (row.role === "user") {
    return {
      id: row.id,
      role: "user",
      text_zh: row.textZh,
      createdAt: row.createdAt.toISOString(),
    };
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
    where: and(
      eq(conversations.userId, userId),
      eq(conversations.status, "active"),
    ),
  });
  if (existing) {
    const rows = await db.query.turns.findMany({
      where: and(
        eq(turns.conversationId, existing.id),
        eq(turns.userId, userId),
      ),
      orderBy: asc(turns.seq),
    });
    return { conversation: toConversation(existing), turns: rows.map(toTurn) };
  }
  try {
    return await createConversationWithGreeting(userId);
  } catch (error) {
    if (!isActiveConversationConflict(error)) throw error;
    return getOrCreateActiveConversation(userId);
  }
}

// The neon-http driver has no interactive (BEGIN/COMMIT-across-round-trips)
// transactions — db.batch() is its one atomic unit (a single HTTP call to
// Neon's transaction endpoint), so every write that must land together goes
// in one batch call. Reads that only decide *what* to batch (the count,
// the oldest row) run beforehand; a race there can at worst skip pruning
// one extra row on a rare concurrent double-create — it cannot violate the
// one-active-conversation invariant, which the DB's own partial unique
// index (conversations_one_active_per_user) enforces regardless.
export async function createConversationWithGreeting(
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
    .where(
      and(eq(conversations.userId, userId), eq(conversations.status, "active")),
    );
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
    conversation: {
      id: conversationId,
      status: "active",
      title: null,
      createdAt: now.toISOString(),
    },
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

export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversation not found");
  }
}

export async function findOwnedConversation(
  userId: string,
  conversationId: string,
) {
  return db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.userId, userId),
    ),
  });
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
  const owned = await findOwnedConversation(userId, conversationId);
  if (!owned) throw new ConversationNotFoundError();

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

export async function countTurns(
  userId: string,
  conversationId: string,
): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(turns)
    .where(
      and(eq(turns.userId, userId), eq(turns.conversationId, conversationId)),
    );
  return value;
}

export async function listConversations(
  userId: string,
): Promise<ConversationSummary[]> {
  const rows = await db.query.conversations.findMany({
    where: eq(conversations.userId, userId),
    orderBy: desc(conversations.createdAt),
  });

  const userTurnRows = await db
    .selectDistinct({ conversationId: turns.conversationId })
    .from(turns)
    .where(and(eq(turns.userId, userId), eq(turns.role, "user")));
  const conversationsWithUserTurn = new Set(
    userTurnRows.map((r) => r.conversationId),
  );

  // Archived conversations the user never actually replied to (just the
  // greeting) aren't real history — the active conversation always shows
  // regardless, since it's the live session, not a past one.
  const relevant = rows.filter(
    (row) => row.status === "active" || conversationsWithUserTurn.has(row.id),
  );

  const summaries = await Promise.all(
    relevant.map(async (row) => {
      // The first turn overall is always the greeting (identical across every
      // conversation), so the fallback preview needs the first *user* turn —
      // absent only for a brand-new active conversation, shown as "Current"
      // regardless.
      const firstUserTurn = await db.query.turns.findFirst({
        where: and(
          eq(turns.conversationId, row.id),
          eq(turns.userId, userId),
          eq(turns.role, "user"),
        ),
        orderBy: asc(turns.seq),
      });
      return { ...toConversation(row), preview: firstUserTurn?.textZh ?? GREETING_ZH };
    }),
  );

  return summaries;
}

/** Best-effort: sets the LLM-generated title once, after the first user turn.
 * Silently no-ops if the conversation was deleted meanwhile. */
export async function setConversationTitle(
  userId: string,
  conversationId: string,
  title: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({ title })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}

export async function getConversationTurns(
  userId: string,
  conversationId: string,
): Promise<Turn[] | null> {
  const owned = await findOwnedConversation(userId, conversationId);
  if (!owned) return null;

  const rows = await db.query.turns.findMany({
    where: and(
      eq(turns.conversationId, conversationId),
      eq(turns.userId, userId),
    ),
    orderBy: asc(turns.seq),
  });
  return rows.map(toTurn);
}

// Archived conversations only — deleting the active one would violate the
// one-active-conversation invariant and there'd be nothing to fall back to
// until a new greeting is created, so the route rejects that case before
// this ever runs.
export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const owned = await findOwnedConversation(userId, conversationId);
  if (!owned || owned.status === "active") return false;

  await db.delete(conversations).where(eq(conversations.id, conversationId));
  return true;
}

export async function getSettings(
  userId: string,
): Promise<{ hskLevel: HskLevel }> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  return { hskLevel: (row?.hskLevel as HskLevel | undefined) ?? 3 };
}

export async function upsertHskLevel(
  userId: string,
  hskLevel: HskLevel,
): Promise<void> {
  await db
    .insert(settings)
    .values({ userId, hskLevel, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { hskLevel, updatedAt: new Date() },
    });
}
