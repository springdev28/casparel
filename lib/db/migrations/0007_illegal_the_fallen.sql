DO $$ BEGIN CREATE TYPE "public"."learning_goal_level" AS ENUM('beginner', 'intermediate', 'advanced'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."learning_goal_status" AS ENUM('active', 'paused', 'completed'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"level" "learning_goal_level" DEFAULT 'beginner' NOT NULL,
	"preferred_formats" text[],
	"target_date" date,
	"status" "learning_goal_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;