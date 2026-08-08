CREATE TABLE IF NOT EXISTS "catalog_resources" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "provider_url" text NOT NULL,
  "external_id" text NOT NULL,
  "canonical_url" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "format" "resource_format" DEFAULT 'other' NOT NULL,
  "subject" text NOT NULL,
  "grade_level" text DEFAULT 'All levels' NOT NULL,
  "language" text DEFAULT 'en' NOT NULL,
  "license" text,
  "author" text,
  "thumbnail_url" text,
  "published_at" timestamp with time zone,
  "source_kind" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog_sync_state" (
  "provider" text PRIMARY KEY NOT NULL,
  "last_attempted_at" timestamp with time zone NOT NULL,
  "last_successful_at" timestamp with time zone,
  "item_count" integer DEFAULT 0 NOT NULL,
  "error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_resources_provider_external_idx" ON "catalog_resources" ("provider", "external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_resources_canonical_url_idx" ON "catalog_resources" ("canonical_url");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_resources_subject_idx" ON "catalog_resources" ("subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_resources_language_idx" ON "catalog_resources" ("language");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_resources_synced_idx" ON "catalog_resources" ("last_synced_at");
