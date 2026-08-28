/**
 * @fileOverview Verification role: exercises List Drift.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A path notices its list moving on, and catches up without losing anything.
 *
 * Building a path from a Learning List takes a snapshot. The list then keeps
 * being a list: resources get added to it for weeks afterwards, and until now
 * the path said nothing about any of them. The learner's own organising was
 * quietly not reaching the thing they study from.
 *
 * What has to be true is the whole of this feature. It has to report what the
 * list has that the path does not, and only that. Catching up has to append
 * and never rewrite -- a finished step stays finished, with its check-in --
 * because the alternative is a list edit deleting evidence of work somebody
 * did. Asking twice must add nothing, and two taps at once must not add each
 * resource twice, since the button is on a phone.
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
const TAPS = 8;

useExclusiveDatabase();

describe.skipIf(!url)("a path and the list it came from", () => {
  it("reports what the list gained, appends it, and keeps finished work", async () => {
    process.env.DATABASE_URL = url;
    const {
      db,
      pool,
      usersTable,
      resourcesTable,
      resourceListsTable,
      listItemsTable,
      learningGoalsTable,
      learningEvidenceTable,
    } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { default: listsRouter } = await import("./routes/lists.js");
    const { default: goalsRouter } = await import("./routes/learningGoals.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [learner] = await db
      .insert(usersTable)
      .values({
        email: `drift-${stamp}@example.test`,
        passwordHash: "x",
        name: "Drift",
        role: "student",
      })
      .returning();
    const [stranger] = await db
      .insert(usersTable)
      .values({
        email: `drift-stranger-${stamp}@example.test`,
        passwordHash: "x",
        name: "Drift Stranger",
        role: "student",
      })
      .returning();

    const [list] = await db
      .insert(resourceListsTable)
      .values({
        name: `Waves, as I find them ${stamp}`,
        ownerId: learner.id,
        workspaceRole: "student",
      })
      .returning();

    const saveResource = async (title: string) => {
      const [resource] = await db
        .insert(resourcesTable)
        .values({
          title: `${title} ${stamp}`,
          url: `https://example.test/drift-${title.replace(/\W+/g, "-")}-${stamp}`,
          format: "article",
          subject: "Physics",
          gradeLevel: "Year 12",
          submittedById: learner.id,
        })
        .returning();
      return resource;
    };

    const first = await saveResource("Superposition");
    const second = await saveResource("Standing waves");
    await db.insert(listItemsTable).values([
      { listId: list.id, resourceId: first.id, position: 0 },
      { listId: list.id, resourceId: second.id, position: 1 },
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api", listsRouter);
    app.use("/api", goalsRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(learner.id, learner.role, learner.activeRole)}`,
    };
    const strangerAuth = {
      Authorization: `Bearer ${issueToken(stranger.id, stranger.role, stranger.activeRole)}`,
    };

    const built = await request(app).post(`/api/lists/${list.id}/path`).set(auth).send({});
    expect(built.status, built.text.slice(0, 200)).toBe(201);
    const goalId: number = built.body.id;

    const drift = (headers: Record<string, string>) =>
      request(app).get(`/api/learning-goals/${goalId}/list-drift`).set(headers);
    const catchUp = (headers: Record<string, string>) =>
      request(app).post(`/api/learning-goals/${goalId}/steps/from-list`).set(headers).send({});

    // ── a path level with its list is behind on nothing ──────────────────────
    const level = await drift(auth);
    expect(level.status, level.text.slice(0, 200)).toBe(200);
    expect(level.body.listId).toBe(list.id);
    expect(level.body.listName).toBe(list.name);
    expect(level.body.added).toEqual([]);

    /*
     * Finish the first step, with a check-in. This is what the catch-up must
     * not disturb: the tick and the evidence behind it are the record of work
     * that happened, and a list edit is not a reason to withdraw either.
     */
    const done = await request(app)
      .post(`/api/learning-goals/${goalId}/steps/${built.body.pathSteps[0].id}/completion`)
      .set(auth)
      .send({ completed: true, understanding: 4, confidence: 3, reflection: "Clear" });
    expect(done.status, done.text.slice(0, 200)).toBe(200);

    // ── the list gains two, and the path is told about both, in list order ───
    const third = await saveResource("Beats");
    const fourth = await saveResource("Doppler");
    await db.insert(listItemsTable).values([
      { listId: list.id, resourceId: fourth.id, position: 3 },
      { listId: list.id, resourceId: third.id, position: 2 },
    ]);

    const behind = await drift(auth);
    expect(behind.status, behind.text.slice(0, 200)).toBe(200);
    expect(behind.body.added.map((row: { id: number }) => row.id)).toEqual([
      third.id,
      fourth.id,
    ]);

    // ── catching up appends, in that order, and disturbs nothing ─────────────
    const caught = await catchUp(auth);
    expect(caught.status, caught.text.slice(0, 200)).toBe(200);
    expect(caught.body.addedStepIds).toHaveLength(2);
    expect(
      caught.body.goal.pathSteps.map((step: { resourceId: number }) => step.resourceId),
    ).toEqual([first.id, second.id, third.id, fourth.id]);
    expect(caught.body.goal.pathSteps[0].completed).toBe(true);
    expect(caught.body.goal.pathSteps[0].id).toBe(built.body.pathSteps[0].id);
    const evidence = await db
      .select({ id: learningEvidenceTable.id })
      .from(learningEvidenceTable)
      .where(eq(learningEvidenceTable.learningGoalId, goalId));
    expect(evidence).toHaveLength(1);

    // ── and there is nothing left to catch up on ─────────────────────────────
    const after = await drift(auth);
    expect(after.body.added).toEqual([]);
    const nothingToDo = await catchUp(auth);
    expect(nothingToDo.status, nothingToDo.text.slice(0, 200)).toBe(200);
    expect(nothingToDo.body.addedStepIds).toEqual([]);
    expect(nothingToDo.body.goal.pathSteps).toHaveLength(4);

    /*
     * A resource taken out of the list is deliberately not drift. The step for
     * it stays -- it may be the finished one -- and the path does not shrink
     * because somebody tidied a list.
     */
    await db.delete(listItemsTable).where(eq(listItemsTable.resourceId, second.id));
    const tidied = await drift(auth);
    expect(tidied.body.added).toEqual([]);
    const stillThere = await catchUp(auth);
    expect(
      stillThere.body.goal.pathSteps.map((step: { resourceId: number }) => step.resourceId),
    ).toEqual([first.id, second.id, third.id, fourth.id]);

    // ── a stranger is told nothing and can add nothing ───────────────────────
    expect((await drift(strangerAuth)).status).toBe(404);
    expect((await catchUp(strangerAuth)).status).toBe(404);

    // ── a goal that was never built from a list has nothing to be behind ─────
    const [ownGoal] = await db
      .insert(learningGoalsTable)
      .values({
        userId: learner.id,
        title: `Made by hand ${stamp}`,
        subject: "Physics",
        level: "beginner",
        workspaceRole: "student",
        pathSteps: [],
      })
      .returning();
    expect(
      (await request(app).get(`/api/learning-goals/${ownGoal.id}/list-drift`).set(auth)).status,
    ).toBe(404);

    /*
     * Eight taps on one new addition. Without the goal's advisory lock each
     * one reads a path without it and appends its own step, and the learner
     * ends up with the same resource eight times over.
     */
    const fifth = await saveResource("Interference");
    await db
      .insert(listItemsTable)
      .values({ listId: list.id, resourceId: fifth.id, position: 4 });

    // Warm, or the race does not happen: on a cold pool the first request
    // finishes before the others have opened a socket.
    const held = await Promise.all(Array.from({ length: TAPS }, () => pool.connect()));
    for (const client of held) client.release();

    const taps = await Promise.all(Array.from({ length: TAPS }, () => catchUp(auth)));
    expect(
      taps.filter((tap) => tap.status >= 500).map((tap) => tap.text.slice(0, 160)),
    ).toEqual([]);
    expect(taps.filter((tap) => tap.body.addedStepIds?.length === 1)).toHaveLength(1);

    const [finalGoal] = await db
      .select({ pathSteps: learningGoalsTable.pathSteps })
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.id, goalId));
    expect(
      finalGoal.pathSteps.filter((step) => step.resourceId === fifth.id),
    ).toHaveLength(1);
    expect(finalGoal.pathSteps).toHaveLength(5);
  }, 60_000);
});
