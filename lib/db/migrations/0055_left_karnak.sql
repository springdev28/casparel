-- Account-level advertising preferences. The 0054 migration was written by
-- hand without a snapshot update, so drizzle-kit regenerated its statements
-- here too; those are removed and only the new column remains, guarded the
-- same way every hand-checked migration in this repository is.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "ad_preferences" jsonb NOT NULL DEFAULT '{"adsDisabled":false,"soundMuted":false}'::jsonb;
