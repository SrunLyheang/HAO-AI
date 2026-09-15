-- drizzle-kit: disable-transaction
CREATE INDEX CONCURRENTLY "turns_conversation_id_seq_idx" ON "turns" USING btree ("conversation_id","seq");