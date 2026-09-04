-- Explicit Light / Dark / System appearance, stored on the account so the
-- choice follows the person to another device. NULL means never chosen, which
-- every client reads as "system" -- the same convention the language column
-- uses, and the reason this is nullable rather than defaulted.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "appearance" text;
