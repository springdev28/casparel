DO $$ BEGIN CREATE TYPE "public"."profile_visibility" AS ENUM('everyone', 'classmates', 'private'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_visibility" "profile_visibility" DEFAULT 'classmates' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "show_bio" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "show_subjects" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "show_grade_or_dept" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "show_website" boolean DEFAULT true NOT NULL;