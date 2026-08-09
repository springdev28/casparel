ALTER TABLE "study_activities" ADD COLUMN IF NOT EXISTS "share_token" text;

CREATE UNIQUE INDEX IF NOT EXISTS "study_activities_share_token_idx"
  ON "study_activities" ("share_token")
  WHERE "share_token" IS NOT NULL;
