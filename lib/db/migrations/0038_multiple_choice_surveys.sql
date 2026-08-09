ALTER TABLE "forum_posts"
  ADD COLUMN IF NOT EXISTS "allow_multiple_votes" boolean DEFAULT false NOT NULL;

DROP INDEX IF EXISTS "forum_survey_vote_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "forum_survey_vote_option_unique"
  ON "forum_survey_votes" ("post_id", "user_id", "option_id");
