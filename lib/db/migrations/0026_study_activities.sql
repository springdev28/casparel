CREATE TABLE IF NOT EXISTS "study_activities" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_id" integer NOT NULL,
  "workspace_role" text DEFAULT 'student' NOT NULL,
  "title" text NOT NULL,
  "subject" text,
  "cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_activities" ADD CONSTRAINT "study_activities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_activities_owner_role_idx" ON "study_activities" USING btree ("owner_id", "workspace_role");
