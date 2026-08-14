-- User verification audit trail.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified_by_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_requested_at" timestamp with time zone;--> statement-breakpoint

-- Resource verification.
--
-- The column is added with DEFAULT 'verified' so that every PRE-EXISTING row is
-- grandfathered in a single pass (Postgres 11+ stores this as metadata, so there
-- is no full-table rewrite and no long ACCESS EXCLUSIVE lock). The default is
-- then flipped to 'unverified' so NEW submissions start in the review queue.
-- Doing it in this order avoids a separate UPDATE over the whole table.
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "verification_status" text DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "verification_status" SET DEFAULT 'unverified';--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "verification_source" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "verification_note" text;--> statement-breakpoint

-- Mark exactly the grandfathered rows so a retroactive review sweep is possible
-- later. Scoped so a re-run can never relabel reviewer/catalog decisions.
UPDATE "resources" SET "verification_source" = 'legacy'
  WHERE "verification_status" = 'verified' AND "verification_source" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "resources_verification_status_idx" ON "resources" USING btree ("verification_status");
