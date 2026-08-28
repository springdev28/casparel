/**
 * @fileOverview Verification role: exercises Step Completion.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Finishing a step: what is written, what is not, and what cannot be lost.
 *
 * This is the study end of the product, and the write has four promises in it.
 *
 * It records what the learner said and nothing more. A tick with a check-in
 * writes evidence against the step; a tick without one writes no evidence at
 * all, because inventing a middling number on somebody's behalf would put a
 * sentence in a teacher's dashboard that nobody said.
 *
 * It records it once. Ticking, unticking and ticking again is one piece of
 * evidence, not three, or a teacher reading class signals is reading a count of
 * fidgeting.
 *
 * It does not delete. Unticking clears the box and leaves the check-in, because
 * evidence is a record of what somebody said at a moment rather than a property
 * of a step.
 *
 * And it cannot lose the step beside it. The phone used to send the whole
 * pathSteps array to tick one box, so two devices -- or a tick and a resource
 * attachment -- meant whichever wrote second erased the other's work. Two
 * concurrent completions of different steps are the check for that, and they
 * fail against a whole-array write.
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

describe.skipIf(!url)("completing a path step", () => {
  it("records the check-in once, keeps it, and never loses another step", async () => {
    process.env.DATABASE_URL = url;
    const { db, pool, usersTable, resourcesTable, learningGoalsTable, learningEvidenceTable } =
      await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    const { default: goalsRouter } = await import("./routes/learningGoals.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [learner] = await db
      .insert(usersTable)
      .values({
        email: `step-done-${stamp}@example.test`,
        passwordHash: "x",
        name: "Step Done",
        role: "student",
      })
      .returning();
    const [stranger] = await db
      .insert(usersTable)
      .values({
        email: `step-done-stranger-${stamp}@example.test`,
        passwordHash: "x",
        name: "Step Done Stranger",
        role: "student",
      })
      .returning();
    const [resource] = await db
      .insert(resourcesTable)
      .values({
        title: `Studied ${stamp}`,
        url: `https://example.test/studied-${stamp}`,
        format: "article",
        subject: "Physics",
        gradeLevel: "Year 12",
        submittedById: learner.id,
      })
      .returning();

    const [goal] = await db
      .insert(learningGoalsTable)
      .values({
        userId: learner.id,
        workspaceRole: "student",
        title: "Understand fields",
        subject: "Physics",
        pathSteps: [
          { id: "one", title: "Read the chapter", query: "fields", completed: false, resourceId: resource.id },
          { id: "two", title: "Try the problems", query: "problems", completed: false },
          { id: "three", title: "Explain it back", query: "explain", completed: false },
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

    const complete = (stepId: string, body: object, headers = auth) =>
      request(app)
        .post(`/api/learning-goals/${goal.id}/steps/${stepId}/completion`)
        .set(headers)
        .send(body);

    const evidenceFor = (stepId: string) =>
      db
        .select()
        .from(learningEvidenceTable)
        .where(
          and(
            eq(learningEvidenceTable.learningGoalId, goal.id),
            eq(learningEvidenceTable.pathStepId, stepId),
          ),
        );

    // ── a tick with a check-in records what was said ─────────────────────────
    const first = await complete("one", {
      completed: true,
      understanding: 4,
      confidence: 3,
      reflection: "I can",
    });
    expect(first.status, first.text.slice(0, 200)).toBe(200);
    expect(first.body.alreadyRecorded).toBe(false);
    expect(first.body.goal.pathSteps[0].completed).toBe(true);
    expect(first.body.evidence).toMatchObject({
      concept: "Read the chapter",
      understanding: 4,
      confidence: 3,
      pathStepId: "one",
      resourceId: resource.id,
      learningGoalId: goal.id,
    });
    // The next thing to do, which is what finishing one asks for.
    expect(first.body.nextStep?.id).toBe("two");

    // ── a tick with no check-in claims nothing about understanding ───────────
    const quiet = await complete("two", { completed: true });
    expect(quiet.status, quiet.text.slice(0, 200)).toBe(200);
    expect(quiet.body.evidence).toBeNull();
    expect(quiet.body.nextStep?.id).toBe("three");
    expect(await evidenceFor("two")).toHaveLength(0);

    // ── half a check-in is refused rather than half recorded ─────────────────
    const half = await complete("three", { completed: true, understanding: 2 });
    expect(half.status, half.text.slice(0, 200)).toBe(400);
    expect(await evidenceFor("three")).toHaveLength(0);

    // ── ticking, unticking and ticking again is one piece of evidence ────────
    const untick = await complete("one", { completed: false });
    expect(untick.status).toBe(200);
    expect(untick.body.goal.pathSteps[0].completed).toBe(false);
    // Unticking leaves the record of what was said.
    expect(await evidenceFor("one")).toHaveLength(1);

    const again = await complete("one", {
      completed: true,
      understanding: 1,
      confidence: 1,
      reflection: "Not yet",
    });
    expect(again.status).toBe(200);
    expect(again.body.evidence).toBeNull();
    const evidence = await evidenceFor("one");
    expect(evidence).toHaveLength(1);
    // The first answer, unchanged: the second tick did not rewrite it.
    expect(evidence[0].understanding).toBe(4);

    // ── somebody else's goal is not theirs to tick ───────────────────────────
    const theirs = await complete("three", { completed: true }, strangerAuth);
    expect(theirs.status).toBe(404);

    // ── and the step says what to do with it ────────────────────────────────
    //
    // The step's resource is an article, so reading is the answer; the step
    // with nothing on it sends the learner to find something.
    const activity = await request(app)
      .get(`/api/learning-goals/${goal.id}/steps/one/activity`)
      .set(auth);
    expect(activity.status, activity.text.slice(0, 200)).toBe(200);
    expect(activity.body.kind).toBe("read");
    expect(activity.body.because).toBe("format");
    expect(activity.body.resource?.id).toBe(resource.id);
    expect(activity.body.query).toBeNull();

    const empty = await request(app)
      .get(`/api/learning-goals/${goal.id}/steps/two/activity`)
      .set(auth);
    expect(empty.status).toBe(200);
    expect(empty.body.kind).toBe("find");
    expect(empty.body.because).toBe("no_resource");
    expect(empty.body.query).toBe("problems");
    expect(empty.body.resource).toBeNull();

    const missing = await request(app)
      .get(`/api/learning-goals/${goal.id}/steps/nowhere/activity`)
      .set(auth);
    expect(missing.status).toBe(404);

    // ── two steps finished at once, and neither is lost ──────────────────────
    await db
      .update(learningGoalsTable)
      .set({
        pathSteps: [
          { id: "one", title: "Read the chapter", query: "fields", completed: false, resourceId: resource.id },
          { id: "two", title: "Try the problems", query: "problems", completed: false },
          { id: "three", title: "Explain it back", query: "explain", completed: false },
        ],
      })
      .where(eq(learningGoalsTable.id, goal.id));

    // Warm, or the two requests do not overlap and the race never happens.
    const held = await Promise.all(Array.from({ length: 4 }, () => pool.connect()));
    for (const client of held) client.release();

    const [aDone, bDone] = await Promise.all([
      complete("one", { completed: true }),
      complete("three", { completed: true }),
    ]);
    expect(aDone.status).toBe(200);
    expect(bDone.status).toBe(200);

    const [after] = await db
      .select()
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.id, goal.id));
    const completedIds = after.pathSteps
      .filter((step) => step.completed)
      .map((step) => step.id)
      .sort();
    expect(
      completedIds,
      "two steps were finished at the same time and both must have stayed finished",
    ).toEqual(["one", "three"]);
  });
});
