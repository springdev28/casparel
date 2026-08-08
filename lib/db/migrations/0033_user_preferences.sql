CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" integer PRIMARY KEY NOT NULL,
  "language" text,
  "interface_colors" jsonb,
  "ambient_style" text,
  "ambient_intensity" real,
  "read_notification_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
  "dashboard_goal_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "continue_studying" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pending_check_ins" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "search_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "resource_search_state" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_preferences_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action
);

ALTER TABLE "study_activities"
  ADD COLUMN IF NOT EXISTS "class_id" integer;

DO $$ BEGIN
  ALTER TABLE "study_activities"
    ADD CONSTRAINT "study_activities_class_id_classes_id_fk"
    FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "study_activities_class_id_idx"
  ON "study_activities" USING btree ("class_id");
