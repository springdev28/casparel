/**
 * @fileOverview Verification role: exercises Date Format.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every field the contract calls a date goes out as one.
 *
 * There are two: a schedule block's `date` and a learning goal's `targetDate`.
 * Both had the same defect, and the second was still live months after the
 * first was found -- which is why this file is about the class of bug rather
 * than about the schedule.
 *
 * The OpenAPI schema declares `date: { type: string, format: date }`, orval
 * turns that into `zod.coerce.date()`, and parsing a row through the generated
 * response schema replaced the database's "2026-08-19" with a JS Date --
 * which `res.json` then wrote as "2026-08-19T00:00:00.000Z". The server broke
 * its own contract on the way out.
 *
 * The mobile schedule believed the contract and compared `block.date` to a
 * YYYY-MM-DD string for the selected day. That comparison could never be true,
 * so schedule blocks were invisible on the phone: every timezone, every day,
 * everybody. The web app parses the value into a Date before comparing, which
 * is why nothing looked wrong there.
 *
 * The goal half of it was quieter and had teeth of its own. The web app binds
 * `targetDate` to an `<input type="date">`, and a browser renders a value that
 * is not YYYY-MM-DD as an empty field -- so a learner opening Edit on a goal
 * due in December was shown no date at all, and the goal's own date was one
 * tap from being cleared by somebody who believed the empty field.
 *
 * This goes through the real router and a real database rather than checking
 * the source, because the defect was in the serialised bytes and nowhere else:
 * the route looked correct, the schema looked correct, and the value between
 * them was wrong.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

useExclusiveDatabase();

/** YYYY-MM-DD and nothing else: no time, no zone, no T. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

describe.skipIf(!url)("a schedule block on the wire", () => {
  it("carries a plain date, not a timestamp", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable } = await import("@workspace/db");
    const { default: scheduleRouter } = await import("./routes/schedule.js");
    const { issueToken } = await import("./lib/auth.js");

    const [user] = await db
      .insert(usersTable)
      .values({
        email: `schedule-date-${Date.now()}@example.test`,
        passwordHash: "x",
        name: "Date Format",
        role: "student",
      })
      .returning();
    const token = issueToken(user.id, user.role, user.activeRole);

    const app = express();
    app.use(express.json());
    app.use("/api", scheduleRouter);
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app)
      .post("/api/schedule")
      .set(auth)
      .send({
        title: "Marking",
        date: "2026-08-19",
        startTime: "09:00",
        endTime: "10:00",
      });
    expect(created.status, created.text.slice(0, 200)).toBe(201);
    expect(created.body.date, "the block that was just created").toMatch(DATE_ONLY);

    const listed = await request(app)
      .get("/api/schedule?weekStart=2026-08-17")
      .set(auth);
    expect(listed.status).toBe(200);
    const block = listed.body.find((item: { id: number }) => item.id === created.body.id);
    expect(block, "the block should be in its own week").toBeTruthy();
    expect(block.date, "the same block, listed").toMatch(DATE_ONLY);

    const updated = await request(app)
      .patch(`/api/schedule/${created.body.id}`)
      .set(auth)
      .send({ title: "Marking and feedback" });
    expect(updated.status, updated.text.slice(0, 200)).toBe(200);
    expect(updated.body.date, "the same block, after an edit").toMatch(DATE_ONLY);
  });
});

describe.skipIf(!url)("a learning goal on the wire", () => {
  it("carries a plain target date, not a timestamp", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable } = await import("@workspace/db");
    const { default: goalsRouter } = await import("./routes/learningGoals.js");
    const { issueToken } = await import("./lib/auth.js");

    const [user] = await db
      .insert(usersTable)
      .values({
        email: `goal-date-${Date.now()}@example.test`,
        passwordHash: "x",
        name: "Goal Date",
        role: "student",
      })
      .returning();
    const token = issueToken(user.id, user.role, user.activeRole);

    const app = express();
    app.use(express.json());
    app.use("/api", goalsRouter);
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app)
      .post("/api/learning-goals")
      .set(auth)
      .send({
        title: "Finish the syllabus",
        subject: "Physics",
        level: "beginner",
        targetDate: "2026-12-01",
      });
    expect(created.status, created.text.slice(0, 200)).toBe(201);
    expect(created.body.targetDate, "the goal that was just created").toMatch(DATE_ONLY);
    // The day asked for, not the day before it: a date read as an instant and
    // formatted west of Greenwich is the previous day, which is the other half
    // of what this field being an instant costs.
    expect(created.body.targetDate).toBe("2026-12-01");

    const listed = await request(app).get("/api/learning-goals").set(auth);
    expect(listed.status).toBe(200);
    const goal = listed.body.find((item: { id: number }) => item.id === created.body.id);
    expect(goal, "the goal should be in the learner's own list").toBeTruthy();
    expect(goal.targetDate, "the same goal, listed").toBe("2026-12-01");

    const edited = await request(app)
      .patch(`/api/learning-goals/${created.body.id}`)
      .set(auth)
      .send({ title: "Finish the syllabus early" });
    expect(edited.status, edited.text.slice(0, 200)).toBe(200);
    expect(edited.body.targetDate, "the same goal, after an edit").toBe("2026-12-01");

    // A goal with no target date says so with a null or by leaving the key
    // out; what it must not do is grow an instant from nowhere.
    const undated = await request(app)
      .post("/api/learning-goals")
      .set(auth)
      .send({ title: "Read more", subject: "Physics", level: "beginner" });
    expect(undated.status, undated.text.slice(0, 200)).toBe(201);
    expect(undated.body.targetDate ?? null).toBeNull();
  });
});
