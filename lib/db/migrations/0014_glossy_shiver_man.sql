CREATE TABLE IF NOT EXISTS "source_review_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_url" text NOT NULL,
	"mode" text NOT NULL,
	"report" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_review_cache_url_mode_idx" ON "source_review_cache" USING btree ("canonical_url","mode");