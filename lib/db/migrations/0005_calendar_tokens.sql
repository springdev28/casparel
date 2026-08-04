CREATE TABLE IF NOT EXISTS "calendar_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE,
  "google_access_token" text,
  "google_refresh_token" text,
  "google_token_expiry" timestamp with time zone,
  "ical_secret" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "calendar_tokens" ADD CONSTRAINT "calendar_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD COLUMN IF NOT EXISTS "google_calendar_event_id" text;
--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN IF NOT EXISTS "google_calendar_event_id" text;
