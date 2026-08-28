-- Which path step a piece of learning evidence came from.
--
-- Completing a step on a goal's path can record a check-in -- what the learner
-- says they can now do -- and that row has to be tied to the step, not just to
-- the goal: a path has several steps, a goal accumulates evidence from all of
-- them, and "has this step been checked in?" is the question both the screen
-- and the write need answered.
--
-- Text, not a foreign key: steps live inside the goal's jsonb path and have no
-- table of their own. Nullable, because every check-in written before this came
-- from the dashboard rather than from a step, and those rows are still evidence.
--
-- The index is what the write reads before recording, so a second tick on a
-- step that has already been checked in does not record a second one.

ALTER TABLE "learning_evidence" ADD COLUMN IF NOT EXISTS "path_step_id" text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "learning_evidence_goal_step_idx"
  ON "learning_evidence" USING btree ("learning_goal_id","path_step_id");
