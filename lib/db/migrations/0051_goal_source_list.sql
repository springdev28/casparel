-- Record which Learning List a goal's path was built from.
--
-- A Learning List is an ordered set of resources and a goal path is an ordered
-- set of steps, so turning one into the other is the product's own workflow
-- (docs/core-workflow-mobile-polish.md, "List-to-Path review"). Building a path
-- twice from the same list must not leave the learner with two of them, and the
-- only way to know one has been built is to record where it came from.
--
-- Nullable, because every goal written before this, and every goal somebody
-- types in themselves, came from no list in particular.
--
-- ON DELETE SET NULL rather than CASCADE: the goal is the learner's own work and
-- outlives the list it was built from. What is lost when the list goes is the
-- provenance, not the path.
--
-- The index is what the idempotency check reads: "has this learner already built
-- a path from this list?", asked on every attempt.
--
-- Every statement is guarded, so re-running this migration is harmless.

ALTER TABLE "learning_goals" ADD COLUMN IF NOT EXISTS "source_list_id" integer;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "learning_goals" DROP CONSTRAINT IF EXISTS "learning_goals_source_list_id_resource_lists_id_fk";
  ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_source_list_id_resource_lists_id_fk"
    FOREIGN KEY ("source_list_id") REFERENCES "public"."resource_lists"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "learning_goals_source_list_idx"
  ON "learning_goals" USING btree ("user_id","source_list_id");
