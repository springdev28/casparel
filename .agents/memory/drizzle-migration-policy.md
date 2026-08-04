---
name: Drizzle migration policy
description: Correct approach for adding DB schema changes — all SQL is idempotent so migrations run safely at startup on any existing database.
---

# Drizzle migration policy

Every migration in `lib/db/migrations/` follows these idempotency rules:

- `CREATE TABLE IF NOT EXISTS` — table creation is always guarded.
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — column additions are guarded.
- Enum creation uses `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`.
- FK and PK constraints use the same `EXCEPTION WHEN duplicate_object THEN NULL` pattern.

**Why:** The database may have been partially set up by earlier `drizzle push` runs (before the migration-based workflow was adopted), so migrations must be safe to replay.

**How to apply:**
1. Write a new SQL migration file using the patterns above.
2. Add an entry to `lib/db/migrations/meta/_journal.json` (next idx, a descriptive tag).
3. Commit both files — the API server runs `runMigrations()` at startup and Drizzle picks up all journal entries not yet in `drizzle.__drizzle_migrations`.
4. **Never apply schema changes manually via `psql` or `ALTER TABLE` outside a migration file** — they won't be tracked and will be re-applied (and fail or no-op) on the next startup.
