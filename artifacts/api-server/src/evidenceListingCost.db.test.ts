/**
 * @fileOverview Verification role: exercises Evidence Listing Cost.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Reading a learner's check-ins costs the same in year two as in week one.
 *
 * Learning evidence is the one table here that grows without a ceiling. Goals,
 * lists, canvases and study sets are all capped by a plan, so a listing of them
 * is bounded by something a person cannot exceed. A check-in is written every
 * time somebody finishes a step, for as long as they keep studying, and nothing
 * was limiting the listing of them.
 *
 * The phone's goal screen was the caller that made it matter: it read every row
 * a learner had ever recorded, over whatever connection they were on, in order
 * to draw "checked in" beside three steps. So what is asserted here is what
 * that screen actually needs -- one goal's evidence, and only that -- and that
 * the general listing has a ceiling a year of studying cannot pass.
 *
 * Counting rows rather than timing: the defect is not "slow", it is "grows
 * with how long somebody has used the product".
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

/** More than the ceiling, so the ceiling is the thing being measured. */
const WRITTEN = 260;
const CEILING = 200;

useExclusiveDatabase();

describe.skipIf(!url)("reading learning evidence", () => {
  it("returns one goal's check-ins, and never more than a page of anyone's", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable, learningGoalsTable, learningEvidenceTable } =
      await import("@workspace/db");
    const { default: evidenceRouter } = await import("./routes/learningEvidence.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [learner] = await db
      .insert(usersTable)
      .values({
        email: `evidence-cost-${stamp}@example.test`,
        passwordHash: "x",
        name: "Evidence Cost",
        role: "student",
      })
      .returning();

    const [first, second] = await db
      .insert(learningGoalsTable)
      .values([
        {
          userId: learner.id,
          title: `Optics ${stamp}`,
          subject: "Physics",
          level: "beginner",
          workspaceRole: "student",
          pathSteps: [],
        },
        {
          userId: learner.id,
          title: `Waves ${stamp}`,
          subject: "Physics",
          level: "beginner",
          workspaceRole: "student",
          pathSteps: [],
        },
      ])
      .returning();

    /*
     * A year of studying, split across two goals. The rows for the goal under
     * test are written first, so they are the *oldest* -- without a filter the
     * newest page would not contain them, which is the under-reporting this
     * endpoint's ceiling would otherwise cause.
     */
    await db.insert(learningEvidenceTable).values(
      Array.from({ length: 30 }, (_, index) => ({
        userId: learner.id,
        learningGoalId: first.id,
        pathStepId: `step-${index}`,
        concept: `Optics idea ${index}`,
        confidence: 2,
        understanding: 3,
      })),
    );
    await db.insert(learningEvidenceTable).values(
      Array.from({ length: WRITTEN }, (_, index) => ({
        userId: learner.id,
        learningGoalId: second.id,
        pathStepId: `other-${index}`,
        concept: `Waves idea ${index}`,
        confidence: 2,
        understanding: 3,
      })),
    );

    const app = express();
    app.use(express.json());
    app.use("/api", evidenceRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(learner.id, learner.role, learner.activeRole)}`,
    };

    // ── one goal's evidence, all of it, and nothing else's ───────────────────
    const forGoal = await request(app)
      .get(`/api/learning-evidence?goalId=${first.id}`)
      .set(auth);
    expect(forGoal.status, forGoal.text.slice(0, 200)).toBe(200);
    expect(forGoal.body).toHaveLength(30);
    expect(
      forGoal.body.every(
        (row: { learningGoalId: number }) => row.learningGoalId === first.id,
      ),
    ).toBe(true);

    /*
     * And the general listing has a ceiling. Before this it returned all 290,
     * and would return every check-in of every year after that -- which is
     * what the goal screen was downloading to mark three steps.
     */
    const everything = await request(app).get("/api/learning-evidence").set(auth);
    expect(everything.status, everything.text.slice(0, 200)).toBe(200);
    expect(everything.body).toHaveLength(CEILING);
    // Newest first, so a ceiling keeps the recent picture rather than a random
    // slice of it.
    expect(
      everything.body.every(
        (row: { learningGoalId: number }) => row.learningGoalId === second.id,
      ),
    ).toBe(true);

    const smaller = await request(app).get("/api/learning-evidence?limit=5").set(auth);
    expect(smaller.body).toHaveLength(5);

    // A limit beyond the cap is a bad request rather than a way around it.
    expect((await request(app).get("/api/learning-evidence?limit=5000").set(auth)).status).toBe(
      400,
    );
  }, 60_000);
});
