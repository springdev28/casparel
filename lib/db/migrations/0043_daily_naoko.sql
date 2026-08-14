ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan_expires_at" timestamp with time zone;
