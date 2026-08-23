ALTER TABLE "learning_goals" ADD COLUMN IF NOT EXISTS "source_list_id" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_source_list_id_resource_lists_id_fk"
    FOREIGN KEY ("source_list_id") REFERENCES "public"."resource_lists"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learning_goals_user_workspace_source_list_unique" ON "learning_goals" USING btree ("user_id","workspace_role","source_list_id");
