CREATE TABLE "usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"route" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_log_user_created_idx" ON "usage_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_log_created_idx" ON "usage_log" USING btree ("created_at");