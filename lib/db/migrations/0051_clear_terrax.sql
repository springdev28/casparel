CREATE TABLE IF NOT EXISTS "support_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"email_encrypted" text NOT NULL,
	"subject_encrypted" text NOT NULL,
	"message_encrypted" text NOT NULL,
	"device_encrypted" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_requests_status_created_idx" ON "support_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_requests_created_idx" ON "support_requests" USING btree ("created_at");--> statement-breakpoint
-- This table is created after the migration that enabled RLS on every existing
-- public table. Keep the unused Supabase/PostgREST surface closed here too;
-- the owning API connection continues to bypass RLS.
ALTER TABLE IF EXISTS "support_requests" ENABLE ROW LEVEL SECURITY;
