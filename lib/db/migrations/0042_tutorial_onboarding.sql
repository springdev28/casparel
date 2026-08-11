ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "tutorial_seen" boolean DEFAULT true NOT NULL;
