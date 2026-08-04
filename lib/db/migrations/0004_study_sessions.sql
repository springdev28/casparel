DO $$ BEGIN
  CREATE TYPE "public"."session_participant_status" AS ENUM('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizer_id" integer NOT NULL,
  "title" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "duration_minutes" integer DEFAULT 60 NOT NULL,
  "topic" text,
  "resource_id" integer,
  "meeting_url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_session_participants" (
  "session_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "status" "session_participant_status" DEFAULT 'pending' NOT NULL,
  "responded_at" timestamp with time zone,
  CONSTRAINT "study_session_participants_session_id_user_id_pk" PRIMARY KEY ("session_id", "user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "study_session_participants" ADD CONSTRAINT "study_session_participants_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "study_session_participants" ADD CONSTRAINT "study_session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
