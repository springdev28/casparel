/**
 * @fileOverview Verification role: exercises Path Editing.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Editing a path without undoing what somebody else just did to it.
 *
 * A learning path is one JSON column, so every client that changes it by
 * reading the array, altering one entry and writing the whole thing back is
 * writing a path as it was when that client last read. Ticking was moved off
 * that; renaming, adding, deleting and reordering were not, and each of them
 * loses whatever arrived in between -- a tick from the phone, a resource
 * attached from the save sheet, a step brought forward from the list.
 *
 * What is checked here is that each edit says only what it means to say. A
 * rename that runs alongside a tick leaves both. A delete leaves the check-in
 * that was recorded against the step, because evidence is what somebody said
 * at a moment rather than a property of a step. A reorder takes ids, keeps a
 * step the caller never saw, and refuses an order naming a step that is gone
 * rather than quietly producing an order nobody chose.
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

type Step = { id: string; title: string; completed: boolean };

describe.skipIf(!url)("editing one step of a path", () => {
  it("changes only what it names, and keeps what it does not", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable, learningGoalsTable, learningEvidenceTable } =
      await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { default: goalsRouter } = await import("./routes/learningGoals.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [learner] = await db
      .insert(usersTable)
      .values({
        email: `path-edit-${stamp}@example.test`,
        passwordHash: "x",
        name: "Path Edit",
        role: "student",
      })
      .returning();
    const [stranger] = await db
      .insert(usersTable)
      .values({
        email: `path-edit-stranger-${stamp}@example.test`,
        passwordHash: "x",
        name: "Path Edit Stranger",
        role: "student",
      })
      .returning();

    const [goal] = await db
      .insert(learningGoalsTable)
      .values({
        userId: learner.id,
        title: `Optics ${stamp}`,
        subject: "Physics",
        level: "beginner",
        workspaceRole: "student",
        pathSteps: [
          { id: "one", title: "Refraction", query: "Refraction", completed: false },
          { id: "two", title: "Lenses", query: "Lenses", completed: false },
          { id: "three", title: "Mirrors", query: "Mirrors", completed: false },
        ],
      })
      .returning();

    const app = express();
    app.use(express.json());
    app.use("/api", goalsRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(learner.id, learner.role, learner.activeRole)}`,
    };
    const strangerAuth = {
      Authorization: `Bearer ${issueToken(stranger.id, stranger.role, stranger.activeRole)}`,
    };
    const base = `/api/learning-goals/${goal.id}`;
    const titles = (body: { pathSteps: Step[] }) =>
      body.pathSteps.map((step) => step.title);
    const ids = (body: { pathSteps: Step[] }) => body.pathSteps.map((step) => step.id);

    // ── adding appends, and says so with a 201 ───────────────────────────────
    const added = await request(app)
      .post(`${base}/steps`)
      .set(auth)
      .send({ title: "Total internal reflection" });
    expect(added.status, added.text.slice(0, 200)).toBe(201);
    expect(titles(added.body)).toEqual([
      "Refraction",
      "Lenses",
      "Mirrors",
      "Total internal reflection",
    ]);
    const fourth = ids(added.body)[3];

    // ── renaming changes one step, and the query follows the title ───────────
    const renamed = await request(app)
      .patch(`${base}/steps/two`)
      .set(auth)
      .send({ title: "Thin lenses" });
    expect(renamed.status, renamed.text.slice(0, 200)).toBe(200);
    expect(titles(renamed.body)).toEqual([
      "Refraction",
      "Thin lenses",
      "Mirrors",
      "Total internal reflection",
    ]);
    expect(
      renamed.body.pathSteps.find((step: { id: string }) => step.id === "two").query,
    ).toBe("Thin lenses");

    /*
     * The defect these endpoints exist for. Tick a step, then rename another
     * one the way a client with a stale copy would: through the endpoint that
     * names only the step it is about. The tick must survive.
     */
    const ticked = await request(app)
      .post(`${base}/steps/one/completion`)
      .set(auth)
      .send({ completed: true, understanding: 4, confidence: 3, reflection: "Got it" });
    expect(ticked.status, ticked.text.slice(0, 200)).toBe(200);

    const afterTick = await request(app)
      .patch(`${base}/steps/three`)
      .set(auth)
      .send({ title: "Curved mirrors" });
    expect(afterTick.status).toBe(200);
    expect(
      afterTick.body.pathSteps.find((step: { id: string }) => step.id === "one").completed,
    ).toBe(true);
    expect(titles(afterTick.body)).toContain("Curved mirrors");

    // ── reordering takes ids, and keeps a step the caller never named ────────
    const reordered = await request(app)
      .post(`${base}/steps/order`)
      .set(auth)
      .send({ stepIds: ["three", "one", "two"] });
    expect(reordered.status, reordered.text.slice(0, 200)).toBe(200);
    expect(ids(reordered.body)).toEqual(["three", "one", "two", fourth]);
    // And it carried nothing stale back with it.
    expect(
      reordered.body.pathSteps.find((step: { id: string }) => step.id === "one").completed,
    ).toBe(true);
    expect(
      reordered.body.pathSteps.find((step: { id: string }) => step.id === "three").title,
    ).toBe("Curved mirrors");

    // ── an order naming a step that is gone is refused, not guessed at ───────
    const stale = await request(app)
      .post(`${base}/steps/order`)
      .set(auth)
      .send({ stepIds: ["three", "one", "two", "deleted-elsewhere"] });
    expect(stale.status, stale.text.slice(0, 200)).toBe(409);
    const [unchanged] = await db
      .select({ pathSteps: learningGoalsTable.pathSteps })
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.id, goal.id));
    expect(unchanged.pathSteps.map((step) => step.id)).toEqual([
      "three",
      "one",
      "two",
      fourth,
    ]);

    const twice = await request(app)
      .post(`${base}/steps/order`)
      .set(auth)
      .send({ stepIds: ["one", "one"] });
    expect(twice.status).toBe(409);

    /*
     * Deleting a step keeps the check-in recorded against it. A learner
     * tidying their path is not withdrawing what they told a teacher while
     * working through it.
     */
    const deleted = await request(app).delete(`${base}/steps/one`).set(auth);
    expect(deleted.status, deleted.text.slice(0, 200)).toBe(200);
    expect(ids(deleted.body)).toEqual(["three", "two", fourth]);
    const evidence = await db
      .select({ pathStepId: learningEvidenceTable.pathStepId })
      .from(learningEvidenceTable)
      .where(eq(learningEvidenceTable.learningGoalId, goal.id));
    expect(evidence.map((row) => row.pathStepId)).toEqual(["one"]);

    // ── a step that is not there is not found, and changes nothing ───────────
    expect((await request(app).delete(`${base}/steps/one`).set(auth)).status).toBe(404);
    expect(
      (await request(app).patch(`${base}/steps/gone`).set(auth).send({ title: "x" }))
        .status,
    ).toBe(404);

    // ── and none of it is a stranger's to do ─────────────────────────────────
    expect(
      (await request(app).post(`${base}/steps`).set(strangerAuth).send({ title: "x" }))
        .status,
    ).toBe(404);
    expect(
      (await request(app).patch(`${base}/steps/two`).set(strangerAuth).send({ title: "x" }))
        .status,
    ).toBe(404);
    expect((await request(app).delete(`${base}/steps/two`).set(strangerAuth)).status).toBe(
      404,
    );
    expect(
      (await request(app)
        .post(`${base}/steps/order`)
        .set(strangerAuth)
        .send({ stepIds: ["two"] })).status,
    ).toBe(404);

    const [finalGoal] = await db
      .select({ pathSteps: learningGoalsTable.pathSteps })
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.id, goal.id));
    expect(finalGoal.pathSteps.map((step) => step.id)).toEqual(["three", "two", fourth]);
  }, 60_000);

  /*
   * The same property, asserted the way it actually fails: four edits to one
   * path at the same moment. Each names one thing, so all four have to be
   * there at the end. A client rebuilding the array would leave whichever
   * wrote last and silently drop the other three.
   */
  it("keeps every edit when four of them arrive at once", async () => {
    process.env.DATABASE_URL = url;
    const { db, pool, usersTable, learningGoalsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { default: goalsRouter } = await import("./routes/learningGoals.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [learner] = await db
      .insert(usersTable)
      .values({
        email: `path-race-${stamp}@example.test`,
        passwordHash: "x",
        name: "Path Race",
        role: "student",
      })
      .returning();
    const [goal] = await db
      .insert(learningGoalsTable)
      .values({
        userId: learner.id,
        title: `Waves at once ${stamp}`,
        subject: "Physics",
        level: "beginner",
        workspaceRole: "student",
        pathSteps: [
          { id: "a", title: "A", query: "A", completed: false },
          { id: "b", title: "B", query: "B", completed: false },
          { id: "c", title: "C", query: "C", completed: false },
        ],
      })
      .returning();

    const app = express();
    app.use(express.json());
    app.use("/api", goalsRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(learner.id, learner.role, learner.activeRole)}`,
    };
    const base = `/api/learning-goals/${goal.id}`;

    // Warm, or the race does not happen: on a cold pool the first request
    // finishes before the others have opened a socket.
    const held = await Promise.all(Array.from({ length: 4 }, () => pool.connect()));
    for (const client of held) client.release();

    const results = await Promise.all([
      request(app).post(`${base}/steps/a/completion`).set(auth).send({ completed: true }),
      request(app).patch(`${base}/steps/b`).set(auth).send({ title: "B renamed" }),
      request(app).delete(`${base}/steps/c`).set(auth),
      request(app).post(`${base}/steps`).set(auth).send({ title: "D added" }),
    ]);
    expect(
      results.filter((one) => one.status >= 400).map((one) => one.text.slice(0, 160)),
    ).toEqual([]);

    const [after] = await db
      .select({ pathSteps: learningGoalsTable.pathSteps })
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.id, goal.id));
    const byId = new Map(after.pathSteps.map((step) => [step.id, step]));
    expect(byId.get("a")?.completed).toBe(true);
    expect(byId.get("b")?.title).toBe("B renamed");
    expect(byId.has("c")).toBe(false);
    expect(after.pathSteps.some((step) => step.title === "D added")).toBe(true);
    expect(after.pathSteps).toHaveLength(3);
  }, 60_000);
});
