/**
 * @fileOverview Verification role: exercises Provenance Showcase.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The provenance showcase, checked against a real Postgres.
 *
 * The mocked tests prove the routing (personal → platform → catalogue) but not
 * the SQL, and the SQL is exactly what failed in production: the endpoint
 * shipped, answered 200, and returned no entries on a site that visibly holds
 * verified resources. The catch that keeps a marketing card from breaking the
 * landing page also hid the reason.
 *
 * CI has no database, so this skips unless one is provided:
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 *
 * Naming this file alone works too, but the whole suite is the useful run: the
 * db files take turns rather than racing, so nothing is gained by running them
 * one at a time.
 *
 * Points at a throwaway database: resources and users are emptied.
 */
import { beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

// This file empties users and resources. Another db test file doing the same
// in a parallel worker would seed over the top of these fixtures.
useExclusiveDatabase();

let app: Express;

describe.skipIf(!url)("provenance showcase against a real database", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const db = await import("@workspace/db");
    await db.runMigrations();
    const { pool } = db;
    await pool.query(
      "truncate list_items, resource_lists, resources, users restart identity cascade",
    );
    await pool.query(
      `insert into users (id, name, email, password_hash, role)
       values (1, 'Seed', 'seed@example.test', 'x', 'teacher')`,
    );
    // Two verified resources and one unverified, mirroring the live library:
    // a catalogue with material but no list holding any of it.
    await pool.query(
      `insert into resources
         (title, url, description, format, subject, grade_level, submitted_by_id, verification_status)
       values
         ('Android Programlama', 'https://tr.wikibooks.org/wiki/Android_Programlama',
          'A complete open educational book.', 'article', 'Okumak', 'All levels', 1, 'verified'),
         ('Linear Algebra', 'https://ocw.mit.edu/courses/18-06',
          'University course.', 'article', 'Mathematics', 'All levels', 1, 'verified'),
         ('Not reviewed yet', 'https://example.test/pending',
          'Submitted.', 'article', 'Other', 'All levels', 1, 'unverified')`,
    );

    const resourcesRouter = (await import("./routes/resources.js")).default;
    app = express();
    app.use(express.json());
    app.use("/api", resourcesRouter);
  });

  it("shows the catalogue when no list holds anything", async () => {
    const res = await request(app).get("/api/resources/provenance-showcase");
    expect(res.status).toBe(200);
    expect(res.body.personalised).toBe(false);
    // The bug this file exists for: this was [] in production.
    expect(res.body.entries.length).toBeGreaterThan(0);
    const titles = res.body.entries.map((e: { title: string }) => e.title);
    expect(titles).toContain("Android Programlama");
    // An unverified submission must never reach an anonymous caller.
    expect(titles).not.toContain("Not reviewed yet");
  });

  it("gives each entry a real host and verdict", async () => {
    const res = await request(app).get("/api/resources/provenance-showcase");
    const byTitle = Object.fromEntries(
      res.body.entries.map((e: { title: string }) => [e.title, e]),
    );
    expect(byTitle["Android Programlama"].host).toBe("tr.wikibooks.org");
    expect(byTitle["Linear Algebra"].provenanceLevel).toBe("institutional");
    expect(byTitle["Linear Algebra"].savedCount).toBe(0);
    for (const entry of res.body.entries) {
      expect(entry.provenanceSignals.length).toBeGreaterThan(0);
    }
  });

  it("prefers what people actually saved once a list holds something", async () => {
    const db = await import("@workspace/db");
    await db.pool.query(
      `insert into resource_lists (id, name, owner_id) values (1, 'Seed list', 1)`,
    );
    await db.pool.query(
      `insert into list_items (list_id, resource_id)
       select 1, id from resources where title = 'Linear Algebra'`,
    );
    const res = await request(app).get("/api/resources/provenance-showcase");
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({
      title: "Linear Algebra",
      savedCount: 1,
    });
  });
});
