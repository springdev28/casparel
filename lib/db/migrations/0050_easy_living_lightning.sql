ALTER TABLE "resource_lists" ADD COLUMN IF NOT EXISTS "share_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resource_lists_share_token_idx" ON "resource_lists" USING btree ("share_token");
