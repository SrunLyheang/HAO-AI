import { sql } from "drizzle-orm";
import { bigserial, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  userId: text("user_id").primaryKey(),
  hskLevel: integer("hsk_level").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversations_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    index("conversations_user_id_idx").on(t.userId),
  ],
);

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["user", "ai"] }).notNull(),
    textZh: text("text_zh").notNull(),
    pinyin: text("pinyin"),
    textEn: text("text_en"),
    correction: text("correction"),
    correctionPinyin: text("correction_pinyin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    seq: bigserial("seq", { mode: "bigint" }).notNull(),
  },
  (t) => [index("turns_conversation_id_seq_idx").on(t.conversationId, t.seq)],
);

export const usageLog = pgTable(
  "usage_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    route: text("route").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("usage_log_user_created_idx").on(t.userId, t.createdAt),
    index("usage_log_created_idx").on(t.createdAt),
  ],
);
