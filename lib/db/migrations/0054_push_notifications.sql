ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "notification_preferences" jsonb NOT NULL DEFAULT '{"enabled":true,"messages":true,"classes":true,"activities":true,"goals":true,"schedule":true,"account":true,"announcements":true}'::jsonb;

CREATE TABLE IF NOT EXISTS "push_device_tokens" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "platform" text NOT NULL DEFAULT 'android',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_device_tokens_token_unique"
  ON "push_device_tokens" ("token");
