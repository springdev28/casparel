-- Close the REST API on the tables added since it was closed.
--
-- 0050 enabled row level security on every table in the public schema, and it
-- used a loop precisely so that no list could go stale. A migration still only
-- runs once, though, so it protected the tables that existed the day it ran and
-- nothing added afterwards: 0054 created `push_device_tokens` four migrations
-- later, and that table -- a person's device, addressable, one row per phone --
-- has stood published to anyone holding the project's anon key ever since.
--
-- The same loop again, narrowed to the tables that lack it, so this is a no-op
-- on a database that is already covered and needs no list of names.
--
-- Still not `FORCE ROW LEVEL SECURITY`: that variant applies to the owner too,
-- which is the app, and with no policies written it would refuse every query
-- the server makes. `rowLevelSecurity.db.test.ts` holds both halves of that --
-- every table enabled, no table forced -- and is what caught this.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND NOT rowsecurity
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      target.tablename
    );
  END LOOP;
END $$;
