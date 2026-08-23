/**
 * @fileOverview Verification role: exercises Admin Overview.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
    pool: { query: vi.fn() },
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

import { db, pool } from "@workspace/db";
import adminRouter from "./admin.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", adminRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(db.select).mockImplementation((fields?: Record<string, unknown>) => {
    let tableName = "";
    const keys = Object.keys(fields ?? {});
    const rows = () => {
      if (tableName === "users" && keys.includes("id")) return [];
      return [{ value: tableName === "users" ? 12 : 0 }];
    };
    const chain = {
      from: vi.fn().mockImplementation((table: { _name: string }) => {
        tableName = table._name;
        return chain;
      }),
      where: vi.fn().mockResolvedValue([{ value: 2 }]),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(rows()).then(resolve, reject),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  vi.mocked(pool.query).mockImplementation((statement: unknown) => {
    const sqlText = String(statement);
    if (sqlText.includes("WITH learner_accounts")) {
      return Promise.resolve({
        rows: [{
          learner_accounts: 7,
          educator_accounts: 5,
          accounts_both_learn_and_teach: 3,
          active_class_owners_30d: 2,
          class_learners: 6,
        }],
      }) as unknown as ReturnType<typeof pool.query>;
    }
    if (sqlText.includes("WITH recent_telemetry")) {
      return Promise.resolve({
        rows: [{
          measured_users: 10,
          error_users: 1,
          vital_samples: 28,
          client_errors: 2,
          render_crashes: 1,
          lcp_p75: 2400,
          inp_p75: 250,
          cls_p75: 0.08,
        }],
      }) as unknown as ReturnType<typeof pool.query>;
    }
    return Promise.resolve({ rows: [] }) as unknown as ReturnType<typeof pool.query>;
  });
});

describe("GET /api/admin/overview", () => {
  it("reports overlapping learner and educator populations instead of exclusive roles", async () => {
    const response = await request(buildApp()).get("/api/admin/overview");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      users: 12,
      learnerAccounts: 7,
      educatorAccounts: 5,
      accountsBothLearnAndTeach: 3,
      activeClassOwners30d: 2,
      classLearners: 6,
      admins: 2,
      workflow: {
        activation: {
          registered30d: 0,
          activatedLearners30d: 0,
          activatedEducators30d: 0,
          avgPreviewCoverage: 0,
        },
      },
      reliability: {
        sampleWindowDays: 30,
        measuredUsers30d: 10,
        vitalSamples30d: 28,
        clientErrors30d: 2,
        renderCrashes30d: 1,
        errorFreeUsersRate: 90,
        lcpP75Ms: 2400,
        inpP75Ms: 250,
        clsP75: 0.08,
        lcpSloMet: true,
        inpSloMet: false,
        clsSloMet: true,
        errorFreeUsersSloMet: false,
      },
    });
    expect(response.body).not.toHaveProperty("students");
    expect(response.body).not.toHaveProperty("teachers");
  });
});
