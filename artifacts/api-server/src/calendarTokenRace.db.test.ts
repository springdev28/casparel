/**
 * @fileOverview Verification role: exercises Calendar Token Race.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Two requests asking for the calendar at once do not 500.
 *
 * The row that holds an account's iCal secret is made on first read:
 * `ensureCalendarTokenRow` selected, and inserted when the select found
 * nothing. `calendar_tokens.user_id` is unique, so two requests that arrived
 * together both found nothing and both inserted, and the loser came back
 *
 *   duplicate key value violates unique constraint "calendar_tokens_user_id_key"
 *
 * as a 500. It is not a rare interleaving: every screen that mentions the
 * calendar asks on mount, and the phone app mounts several at once while its
 * tab bar settles. So it happened on the first visit of a brand-new account
 * and never again -- the worst audience for a 500, and a shape that reads like
 * a fluke afterwards because the row now exists.
 *
 * Found by rendering the phone app against a real server
 * (artifacts/mobile/scripts/audit-screens.mjs), which opens the tabs quickly
 * enough to collide. It needs a real database because it is a real unique
 * index doing the rejecting; nothing in the handler's source looks wrong.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

/** Enough to collide, few enough to stay under the pool's ceiling of ten. */
const CALLERS = 8;

useExclusiveDatabase();

describe.skipIf(!url)("two screens asking for the calendar at once", () => {
  it("both get an answer, and the same secret", async () => {
    process.env.DATABASE_URL = url;
    const { db, pool, usersTable } = await import("@workspace/db");
    const { default: calendarRouter } = await import("./routes/calendar.js");
    const { issueToken } = await import("./lib/auth.js");

    const [user] = await db
      .insert(usersTable)
      .values({
        email: `calendar-race-${Date.now()}@example.test`,
        passwordHash: "x",
        name: "Calendar Race",
        role: "student",
      })
      .returning();
    const token = issueToken(user.id, user.role, user.activeRole);

    const app = express();
    app.use(express.json());
    app.use("/api", calendarRouter);
    const auth = { Authorization: `Bearer ${token}` };

    /*
     * Open the connections first, or the race does not happen.
     *
     * On a cold pool the first request's whole select-and-insert finishes
     * while the others are still opening sockets, so they all take the
     * "already exists" branch and the run is green against the broken code --
     * which is exactly what this file did on its first draft. A live server
     * has warm connections, so it is the warm case that has to be tested.
     * Verified: cold, 8 concurrent calls made 1 insert and 0 errors; warm,
     * they made 8 and 7 came back as unique-constraint violations.
     */
    const held = await Promise.all(Array.from({ length: CALLERS }, () => pool.connect()));
    for (const client of held) client.release();

    // Concurrent on purpose, and against an account that has no row yet: that
    // is the only moment the defect exists.
    const answers = await Promise.all(
      Array.from({ length: CALLERS }, () => request(app).get("/api/calendar/status").set(auth)),
    );

    for (const answer of answers) {
      expect(answer.status, answer.text.slice(0, 200)).toBe(200);
    }

    // One row, one secret. Handing back a secret that was not the stored one
    // would sign iCal URLs that nothing can verify.
    const secrets = new Set(answers.map((answer) => answer.body.icalSecret));
    expect(secrets.size, `saw ${[...secrets].join(", ")}`).toBe(1);
    expect([...secrets][0]).toBeTruthy();
  });
});
