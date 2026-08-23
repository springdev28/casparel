CREATE TABLE IF NOT EXISTS "resource_preview_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_url" text NOT NULL,
	"preview_title" text,
	"preview_description" text,
	"preview_image_url" text,
	"preview_author" text,
	"preview_publisher" text,
	"preview_published_at" timestamp with time zone,
	"preview_updated_at" timestamp with time zone,
	"preview_favicon_url" text,
	"preview_source" text DEFAULT 'none' NOT NULL,
	"preview_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resource_preview_cache_canonical_url_idx" ON "resource_preview_cache" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_preview_cache_expires_at_idx" ON "resource_preview_cache" USING btree ("expires_at");
