-- Close the REST API nobody here uses.
--
-- Supabase runs PostgREST beside the database and publishes every table in the
-- public schema through it, reachable with the project's anon key — a value
-- designed to be handed to browsers rather than kept secret. This app never
-- uses that API: there is no Supabase client anywhere in the repository, and
-- the server talks to Postgres directly over DATABASE_URL. So the entire
-- surface stood open and unused, `google_tokens` and `calendar_tokens` among
-- it, which hold other people's OAuth credentials, and `direct_messages`,
-- which holds their private conversations.
--
-- Row level security with no policies refuses every role that does not own the
-- table. PostgREST connects as `authenticator` and switches to `anon` or
-- `authenticated`; none of those own anything here, so all of them are refused.
-- The app connects as `postgres`, which owns all of these tables, and an owner
-- bypasses RLS — so nothing the app does changes. Both halves of that were
-- checked against the live database before this was written, not assumed.
--
-- Deliberately NOT `FORCE ROW LEVEL SECURITY`. That is the variant that applies
-- to the owner too, and with no policies written it would refuse the app itself
-- and take the site down.
--
-- A loop rather than forty-one names: a list goes stale the moment a table is
-- added, and this way re-running it is harmless — enabling twice is a no-op.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      target.tablename
    );
  END LOOP;
END $$;
