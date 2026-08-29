/**
 * @fileOverview Verification role: exercises Study Set Editing.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Two people editing one set of cards, and neither of them losing their work.
 *
 * A study set is one jsonb document, and two accounts can edit it: its owner,
 * and the teacher of the class it was shared into. One person on two devices
 * is the same shape. Every save replaced the whole document, so the second one
 * overwrote the first and nobody was told — and what is lost is the cards a
 * learner revises from.
 *
 * The rule is the one canvases have had since they gained collaborators: a
 * save carries the version it was made from, and a save made from a version
 * that has since moved is refused rather than applied over the top. Refused
 * rather than merged, because two sets of cards cannot be combined without
 * inventing an order nobody chose.
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

const cards = (answer: string) => [
  { id: "a", term: "1", answer },
  { id: "b", term: "3", answer: "4" },
];

describe("editing a study set", () => {
  it.skipIf(!url)("refuses a save made from a version that has moved", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable, studyActivitiesTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { default: activitiesRouter } = await import("./routes/studyActivities.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [owner] = await db
      .insert(usersTable)
      .values({
        email: `set-edit-${stamp}@example.test`,
        passwordHash: "x",
        name: "Set Edit",
        role: "student",
      })
      .returning();

    const app = express();
    app.use(express.json({ limit: "12mb" }));
    app.use("/api", activitiesRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(owner.id, owner.role, owner.activeRole)}`,
    };

    const created = await request(app)
      .post("/api/study-activities")
      .set(auth)
      .send({
        title: `Set ${stamp}`,
        subject: "Mathematics",
        mode: "flashcards",
        cards: cards("2"),
      });
    expect(created.status, created.text.slice(0, 200)).toBe(201);
    const id: number = created.body.id;
    const first: number = created.body.version;
    expect(first).toBe(1);

    const save = (body: object) =>
      request(app).patch(`/api/study-activities/${id}`).set(auth).send({
        title: `Set ${stamp}`,
        subject: "Mathematics",
        mode: "flashcards",
        ...body,
      });

    // ── the first save goes in, and the version moves ────────────────────────
    const saved = await save({ cards: cards("first"), expectedVersion: first });
    expect(saved.status, saved.text.slice(0, 200)).toBe(200);
    expect(saved.body.version).toBe(first + 1);
    expect(saved.body.cards[0].answer).toBe("first");

    /*
     * The second person, still holding the version they opened the editor on.
     * Without the check this write lands and the first person's cards are
     * gone; with it, nothing is written and the answer says what the set now
     * holds so the editor can show it.
     */
    const stale = await save({ cards: cards("second"), expectedVersion: first });
    expect(stale.status, stale.text.slice(0, 200)).toBe(409);
    expect(stale.body.current?.cards?.[0]?.answer).toBe("first");
    expect(stale.body.current?.version).toBe(first + 1);

    const [afterConflict] = await db
      .select({ cards: studyActivitiesTable.cards, version: studyActivitiesTable.version })
      .from(studyActivitiesTable)
      .where(eq(studyActivitiesTable.id, id));
    expect(afterConflict.cards[0].answer).toBe("first");
    expect(afterConflict.version).toBe(first + 1);

    // ── and saving again from the version they were just given works ─────────
    const retried = await save({
      cards: cards("second"),
      expectedVersion: first + 1,
    });
    expect(retried.status, retried.text.slice(0, 200)).toBe(200);
    expect(retried.body.cards[0].answer).toBe("second");

    // ── a save with no version at all is refused, not applied ────────────────
    const versionless = await save({ cards: cards("third") });
    expect(versionless.status, versionless.text.slice(0, 200)).toBe(400);
    const [unchanged] = await db
      .select({ cards: studyActivitiesTable.cards })
      .from(studyActivitiesTable)
      .where(eq(studyActivitiesTable.id, id));
    expect(unchanged.cards[0].answer).toBe("second");

    // ── and a set that is gone is not found, rather than a conflict ──────────
    const missing = await request(app)
      .patch("/api/study-activities/99999999")
      .set(auth)
      .send({
        title: "Gone",
        mode: "flashcards",
        cards: cards("x"),
        expectedVersion: 1,
      });
    expect(missing.status).toBe(404);
  }, 60_000);
});
