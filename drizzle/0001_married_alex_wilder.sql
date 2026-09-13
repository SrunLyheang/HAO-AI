ALTER TABLE "turns" DROP CONSTRAINT "turns_conversation_id_conversations_id_fk";
--> statement-breakpoint
DROP INDEX "conversations_user_id_idx";--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_active_per_user" ON "conversations" USING btree ("user_id") WHERE "conversations"."status" = 'active';