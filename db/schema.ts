import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversations_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
  ],
);

export const turns = pgTable("turns", {
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
});
