ALTER TABLE "study_activities"
  ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'flashcards' NOT NULL;
