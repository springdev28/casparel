-- Let a resource actually be deleted.
--
-- Every foreign key into `resources` was created ON DELETE NO ACTION, so
-- DELETE /resources/:id raised a foreign_key_violation the moment anything
-- referenced the row. Nothing caught it, so the user got an opaque
-- 500 "Internal server error" while trying to remove their own submission.
-- Reviews and list items are the common cases, and a review can be written by
-- any authenticated user, so a stranger could permanently block the owner's
-- delete.
--
-- The right behaviour differs per table:
--   reviews, list_items  - the row is ABOUT the resource and is meaningless
--                          without it, and resource_id is NOT NULL there, so
--                          CASCADE.
--   schedule_blocks,     - the row is a user's own plan that merely points at
--   study_sessions         a resource, and resource_id is nullable, so SET NULL
--                          keeps the block/session and drops the link.
--
-- learning_evidence, class_assignments and workflow_events already SET NULL,
-- and class_resource_recommendations already CASCADEs; they are left alone.
--
-- Each constraint is dropped IF EXISTS and re-added inside a duplicate_object
-- guard, so re-running this migration is safe.

DO $$ BEGIN
  ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_resource_id_resources_id_fk";
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_resource_id_resources_id_fk"
    FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "list_items" DROP CONSTRAINT IF EXISTS "list_items_resource_id_resources_id_fk";
  ALTER TABLE "list_items" ADD CONSTRAINT "list_items_resource_id_resources_id_fk"
    FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "schedule_blocks" DROP CONSTRAINT IF EXISTS "schedule_blocks_resource_id_resources_id_fk";
  ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_resource_id_resources_id_fk"
    FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "study_sessions" DROP CONSTRAINT IF EXISTS "study_sessions_resource_id_resources_id_fk";
  ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_resource_id_resources_id_fk"
    FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
