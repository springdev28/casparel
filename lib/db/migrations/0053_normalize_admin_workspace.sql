-- Administrator is the authoritative account role, not a third workspace.
-- Preserve every administrator permission while moving legacy rows into the
-- student workspace; the account can immediately select teacher through the
-- normal role-switch endpoint.
UPDATE "users"
SET "active_role" = 'student'
WHERE "role" = 'admin' AND "active_role" = 'admin';
