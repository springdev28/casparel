-- Optional fields preserve all existing evidence while letting focused-study
-- submissions identify their path step, elapsed time, and retry key.
ALTER TABLE "learning_evidence" ADD COLUMN IF NOT EXISTS "path_step_id" text;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD COLUMN IF NOT EXISTS "study_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD COLUMN IF NOT EXISTS "client_submission_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learning_evidence_user_submission_unique"
ON "learning_evidence" USING btree ("user_id","client_submission_id");
