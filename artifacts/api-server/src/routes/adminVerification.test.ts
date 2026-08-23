/**
 * @fileOverview Verification role: exercises Admin Verification.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Tests for the resource verification admin endpoints:
 *  • rejection requires a note (the submitter has nothing to act on otherwise)
 *  • approving stamps reviewer as the source
 *  • sending back to unverified clears the source
 *  • unknown resource → 404
 *  • bulk updates are bounded and validated
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let setPayload: Record<string, unknown> | null = null;
let returnRows: Array<Record<string, unknown>> = [];

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { update: vi.fn(), select: vi.fn() },
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    usersTable: stub("users"),
    resourcesTable: stub("resources"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
    learningGoalsTable: stub("learning_goals"),
    forumMaterialsTable: stub("forum_materials"),
    forumPostsTable: stub("forum_posts"),
    forumCommentsTable: stub("forum_comments"),
    studyActivitiesTable: stub("study_activities"),
    canvasesTable: stub("canvases"),
    canvasCollaboratorsTable: stub("canvas_collaborators"),
    resourceListsTable: stub("resource_lists"),
    classAssignmentsTable: stub("class_assignments"),
    scheduleBlocksTable: stub("schedule_blocks"),
    studySessionsTable: stub("study_sessions"),
    learningEvidenceTable: stub("learning_evidence"),
    sourceReviewCacheTable: stub("source_review_cache"),
  };
});

vi.mock("../middlewares/requireAdmin", () => ({
  requireAdmin: (
    req: { userId?: number; accountRole?: string },
    _res: unknown,
    next: () => void,
  ) => {
    req.userId = 1;
    req.accountRole = "admin";
    next();
  },
}));

import { db } from "@workspace/db";
import adminRouter from "./admin.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", adminRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  setPayload = null;
  returnRows = [{ id: 5, title: "A resource", verificationStatus: "verified" }];
  vi.mocked(db.update).mockImplementation(
    () =>
      ({
        set: (values: Record<string, unknown>) => {
          setPayload = values;
          return {
            where: () => ({ returning: () => Promise.resolve(returnRows) }),
          };
        },
      }) as unknown as ReturnType<typeof db.update>,
  );
});

describe("PATCH /api/admin/resources/:id/verification", () => {
  it("approves and records reviewer as the source", async () => {
    const res = await request(buildApp())
      .patch("/api/admin/resources/5/verification")
      .send({ status: "verified" });
    expect(res.status).toBe(200);
    expect(setPayload).toMatchObject({
      verificationStatus: "verified",
      verificationSource: "reviewer",
    });
  });

  it("refuses a rejection with no note", async () => {
    const res = await request(buildApp())
      .patch("/api/admin/resources/5/verification")
      .send({ status: "rejected" });
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts a rejection that carries a note", async () => {
    returnRows = [{ id: 5, title: "A resource", verificationStatus: "rejected" }];
    const res = await request(buildApp())
      .patch("/api/admin/resources/5/verification")
      .send({ status: "rejected", note: "Broken link" });
    expect(res.status).toBe(200);
    expect(setPayload).toMatchObject({
      verificationStatus: "rejected",
      verificationNote: "Broken link",
    });
  });

  it("clears the source when sending an item back to unverified", async () => {
    const res = await request(buildApp())
      .patch("/api/admin/resources/5/verification")
      .send({ status: "unverified" });
    expect(res.status).toBe(200);
    expect(setPayload).toMatchObject({ verificationSource: null });
  });

  it("rejects an unknown status", async () => {
    const res = await request(buildApp())
      .patch("/api/admin/resources/5/verification")
      .send({ status: "approved" });
    expect(res.status).toBe(400);
  });

  it("404s when the resource does not exist", async () => {
    returnRows = [];
    const res = await request(buildApp())
      .patch("/api/admin/resources/999/verification")
      .send({ status: "verified" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/resources/verification/bulk", () => {
  it("updates a batch", async () => {
    returnRows = [{ id: 1 }, { id: 2 }];
    const res = await request(buildApp())
      .post("/api/admin/resources/verification/bulk")
      .send({ ids: [1, 2], status: "verified" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
  });

  it("rejects an empty or oversized batch", async () => {
    const empty = await request(buildApp())
      .post("/api/admin/resources/verification/bulk")
      .send({ ids: [], status: "verified" });
    expect(empty.status).toBe(400);

    const huge = await request(buildApp())
      .post("/api/admin/resources/verification/bulk")
      .send({ ids: Array.from({ length: 101 }, (_, i) => i + 1), status: "verified" });
    expect(huge.status).toBe(400);
  });
});
