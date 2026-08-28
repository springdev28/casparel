-- The learner's own check-ins, newest first.
--
-- Learning evidence is the one table here that grows without a ceiling. Goals,
-- lists, canvases and study sets are all capped by a plan, so a listing of them
-- is bounded by something a person cannot exceed; a check-in is written every
-- time somebody finishes a step, for as long as they keep studying.
--
-- The listing is now bounded and can be filtered to one goal, and both of those
-- read this index instead of sorting every row the learner has ever written.

CREATE INDEX IF NOT EXISTS "learning_evidence_user_recent_idx"
  ON "learning_evidence" USING btree ("user_id","created_at");
