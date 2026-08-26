/**
 * @fileOverview Verification role: exercises Goal Resource Link.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A saved resource reaches a goal's path, once, and stays there.
 *
 * The save sheet on the phone could offer a Learning List and could not offer
 * a goal, because nothing connected the two: a path step was a search intent
 * and had no room for the resource it was about. This is the write that closes
 * that gap, and there are four ways it can be wrong that only a real database
 * shows.
 *
 * It can duplicate. The sheet is a phone sheet and the second tap of a double
 * tap arrives while the first is still in flight; both read a path without the
 * resource and both append. Eight taps here, and the path must carry one step,
 * reported as created once and as already there the other seven times.
 *
 * It can lose the write beside it. The path is one jsonb column, so two
 * attachments in flight together read the same array and each writes its own
 * array back -- the second overwrites the first, and the resource somebody
 * attached a moment ago is simply gone. Read-committed does not prevent this
 * and neither does the row lock the update takes: both writers already hold
 * their stale copy by then. So the taps here are for two different resources
 * at once, which is what the lock is actually for; eight taps for one resource
 * pass whether or not it is held.
 *
 * It can leak. The resource has to be one the account can already see, or
 * attaching is a way to read the title of a submission still in the review
 * queue.
 *
 * It can belong to somebody else. A goal id is a small integer and guessing
 * one is not hard.
 *
 * And it can be quietly erased by the next write. The step is a jsonb
 * document, and the endpoint that ticks a step off sends the whole array
 * back; if the contract for a step does not mention the resource, the schema
 * strips it and every link on the path disappears the first time somebody
 * marks something done. That one is invisible in a unit test with a mocked
 * database, because the mock returns whatever it was handed.
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

describe.skipIf(!url)("attaching a saved resource to a goal", () => {
  it("adds one step, keeps it, and refuses what is not the caller's", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable, resourcesTable, learningGoalsTable } = await import(
      "@workspace/db"
    );
    const { eq } = await import("drizzle-orm");
    const { default: goalsRouter } = await import("./routes/learningGoals.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [learner] = await db
      .insert(usersTable)
      .values({
        email: `goal-link-${stamp}@example.test`,
        passwordHash: "x",
        name: "Goal Link",
        role: "student",
      })
      .returning();
    const [stranger] = await db
      .insert(usersTable)
      .values({
        email: `goal-link-stranger-${stamp}@example.test`,
        passwordHash: "x",
        name: "Goal Link Stranger",
        role: "student",
      })
      .returning();

    const resource = async (
      title: string,
      submittedById: number,
      verificationStatus: "unverified" | "verified",
    ) => {
      const [row] = await db
        .insert(resourcesTable)
        .values({
          title,
          url: `https://example.test/${title.replace(/\W+/g, "-")}-${stamp}`,
          format: "article",
          subject: "Physics",
          gradeLevel: "Year 12",
          submittedById,
          verificationStatus,
        })
        .returning();
      return row;
    };

    const own = await resource("Fields explained", learner.id, "unverified");
    const shared = await resource("Flux for beginners", stranger.id, "verified");
    const hidden = await resource("Still in review", stranger.id, "unverified");
    const raced = await resource("Tapped eight times", learner.id, "unverified");
    const alongside = await resource("Tapped alongside", learner.id, "unverified");

    const [goal] = await db
      .insert(learningGoalsTable)
      .values({
        userId: learner.id,
        workspaceRole: "student",
        title: "Understand electric fields",
        subject: "Physics",
        pathSteps: [
          { id: "foundations", title: "Learn the foundations", query: "fields", completed: false },
        ],
      })
      .returning();

    const app = express();
    app.use(express.json());
    app.use("/api", goalsRouter);
    const learnerAuth = {
      Authorization: `Bearer ${issueToken(learner.id, learner.role, learner.activeRole)}`,
    };
    const strangerAuth = {
      Authorization: `Bearer ${issueToken(stranger.id, stranger.role, stranger.activeRole)}`,
    };

    const link = (goalId: number, resourceId: number, auth: Record<string, string>) =>
      request(app)
        .post(`/api/learning-goals/${goalId}/resources`)
        .set(auth)
        .send({ resourceId });

    // ── the resource the learner saved reaches the path ──────────────────────
    const first = await link(goal.id, own.id, learnerAuth);
    expect(first.status, first.text.slice(0, 200)).toBe(201);
    expect(first.body.alreadyLinked).toBe(false);
    const step = first.body.pathSteps.find(
      (candidate: { id: string }) => candidate.id === first.body.stepId,
    );
    expect(step).toMatchObject({ resourceId: own.id, completed: false });
    expect(step.title).toBe("Fields explained");
    expect(first.body.pathSteps).toHaveLength(2);

    // ── asking twice says so, and changes nothing ────────────────────────────
    const again = await link(goal.id, own.id, learnerAuth);
    expect(again.status, again.text.slice(0, 200)).toBe(200);
    expect(again.body.alreadyLinked).toBe(true);
    expect(again.body.stepId).toBe(first.body.stepId);
    expect(again.body.pathSteps).toHaveLength(2);

    // ── ticking a step off does not erase the link ───────────────────────────
    const ticked = await request(app)
      .patch(`/api/learning-goals/${goal.id}`)
      .set(learnerAuth)
      .send({
        pathSteps: again.body.pathSteps.map(
          (candidate: { id: string; completed: boolean }) =>
            candidate.id === first.body.stepId
              ? { ...candidate, completed: true }
              : candidate,
        ),
      });
    expect(ticked.status, ticked.text.slice(0, 200)).toBe(200);
    expect(
      ticked.body.pathSteps.find(
        (candidate: { id: string }) => candidate.id === first.body.stepId,
      ),
    ).toMatchObject({ resourceId: own.id, completed: true });

    // ── somebody else's published resource is fair game ──────────────────────
    const published = await link(goal.id, shared.id, learnerAuth);
    expect(published.status, published.text.slice(0, 200)).toBe(201);

    // ── somebody else's unreviewed submission is not ─────────────────────────
    const unreviewed = await link(goal.id, hidden.id, learnerAuth);
    expect(unreviewed.status, unreviewed.text.slice(0, 200)).toBe(404);

    // ── and somebody else's goal is not reachable at all ─────────────────────
    const theirs = await link(goal.id, shared.id, strangerAuth);
    expect(theirs.status, theirs.text.slice(0, 200)).toBe(404);

    // ── eight taps for two resources leave one step each ─────────────────────
    const { pool } = await import("@workspace/db");
    // Warm, or the race does not happen: on a cold pool the first request
    // finishes its whole read-and-write while the others are still opening
    // sockets, and the run is green against code that cannot serialise.
    const held = await Promise.all(
      Array.from({ length: TAPS }, () => pool.connect()),
    );
    for (const client of held) client.release();

    const taps = await Promise.all(
      Array.from({ length: TAPS }, (_unused, index) =>
        link(goal.id, index % 2 === 0 ? raced.id : alongside.id, learnerAuth),
      ),
    );
    expect(
      taps.filter((tap) => tap.status >= 500).map((tap) => tap.text.slice(0, 160)),
    ).toEqual([]);
    // One tap for each resource did the writing; the rest found it there.
    expect(taps.filter((tap) => tap.status === 201)).toHaveLength(2);
    expect(taps.filter((tap) => tap.status === 200)).toHaveLength(TAPS - 2);

    const [after] = await db
      .select()
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.id, goal.id));
    expect(
      after.pathSteps.filter((candidate) => candidate.resourceId === raced.id),
    ).toHaveLength(1);
    expect(
      after.pathSteps.filter((candidate) => candidate.resourceId === alongside.id),
    ).toHaveLength(1);
    // The starting step, the learner's own, the published one, and the two
    // raced ones: five, however many taps arrived and in whatever order.
    expect(after.pathSteps).toHaveLength(5);
    // The step that was already there is untouched by any of it: a path
    // written before resources could be attached keeps no key for one.
    expect(after.pathSteps[0].id).toBe("foundations");
    expect(after.pathSteps[0].resourceId ?? null).toBeNull();
  });
});
