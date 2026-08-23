/**
 * @fileOverview Verification role: exercises Row Level Security.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every table in the public schema must have row level security enabled.
 *
 * Supabase publishes the public schema through PostgREST, reachable with the
 * project's anon key — a value meant to be handed to browsers. This app never
 * uses that API and talks to Postgres directly, so the whole surface was open
 * and unused until migration 0050: every table, including the two that hold
 * other people's OAuth tokens and the one that holds their private messages.
 *
 * RLS with no policies denies every role but the table's owner, and the app
 * connects as the owner, so this costs the app nothing. That asymmetry is
 * exactly why it is easy to forget: adding a table and never granting it a
 * policy works perfectly in development and quietly publishes it in production.
 * The check is here rather than in a linter someone has to remember to run.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { describe, expect, it } from "vitest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

useExclusiveDatabase();

describe.skipIf(!url)("row level security", () => {
  it("is enabled on every table the REST API would publish", async () => {
    process.env.DATABASE_URL = url;
    const { db, runMigrations } = await import("@workspace/db");
    await runMigrations();

    const { rows } = await db.execute<{ tablename: string }>(
      `select tablename from pg_tables
       where schemaname = 'public' and not rowsecurity
       order by tablename`,
    );

    expect(
      rows.map((row) => row.tablename),
      "these tables are readable by anyone holding the project's anon key",
    ).toEqual([]);
  }, 60_000);

  it("does not force RLS on the owner, which would lock the app out", async () => {
    // ENABLE and FORCE differ by exactly who they apply to. FORCE includes the
    // table's owner, and the owner is this app — with no policies written that
    // would refuse every query the server makes and take the site down.
    process.env.DATABASE_URL = url;
    const { db, runMigrations } = await import("@workspace/db");
    await runMigrations();

    const { rows } = await db.execute<{ relname: string }>(
      `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity
       order by c.relname`,
    );

    expect(rows.map((row) => row.relname)).toEqual([]);
  }, 60_000);
});
