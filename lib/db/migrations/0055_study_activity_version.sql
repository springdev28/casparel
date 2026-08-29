-- Which edit a study set is on.
--
-- A set is one jsonb document of cards, and two people can edit it: its owner,
-- and the teacher of the class it was shared into. One person on two devices is
-- the same shape. Without a version the second save replaces the first and
-- neither of them is told, and what is lost is the cards a learner revises
-- from.
--
-- Canvases have carried a version since they gained collaborators, for exactly
-- this. Defaulting to 1 rather than 0 so every existing row starts somewhere a
-- client can send back.

ALTER TABLE "study_activities"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
