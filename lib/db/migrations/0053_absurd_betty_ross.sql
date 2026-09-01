CREATE TABLE IF NOT EXISTS "rate_limit_hits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"reset_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_hits_reset_time_idx" ON "rate_limit_hits" USING btree ("reset_time");
--> statement-breakpoint
-- Supabase exposes public tables through PostgREST. The API connects as the
-- owner and continues to write; anon/authenticated roles have no policies and
-- therefore cannot read account/IP-derived limiter keys.
ALTER TABLE "rate_limit_hits" ENABLE ROW LEVEL SECURITY;
