CREATE TABLE IF NOT EXISTS "goal_path_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "creator_id" integer NOT NULL,
  "creator_name" text NOT NULL,
  "title" text NOT NULL,
  "subject" text NOT NULL,
  "description" text,
  "level" "learning_goal_level" DEFAULT 'beginner' NOT NULL,
  "path_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "use_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goal_path_templates" ADD CONSTRAINT "goal_path_templates_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_path_templates_subject_idx" ON "goal_path_templates" USING btree ("subject");
