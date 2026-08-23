/**
 * @fileOverview Verification role: exercises administrator account search, workspace invariants, bans, and audited plan overrides.
 * System connection: mounts the real admin router with a deterministic Drizzle boundary so contract and security regressions fail in the API suite.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateRows: Array<Record<string, unknown>> = [];
let updatePayload: Record<string, unknown> | null = null;
let limitValues: number[] = [];
let offsetValues: number[] = [];
let auditPayload: Record<string, unknown> | null = null;

function queryBuilder(rows: Array<Record<string, unknown>>) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn((value: number) => {
      limitValues.push(value);
      return chain;
    }),
    offset: vi.fn((value: number) => {
      offsetValues.push(value);
      return chain;
    }),
    then: (
      resolve: (value: Array<Record<string, unknown>>) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

function updateBuilder() {
  return {
    set: (values: Record<string, unknown>) => {
      updatePayload = values;
      return {
        where: () => ({ returning: () => Promise.resolve(updateRows) }),
      };
    },
  };
}

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: {
      select: vi.fn(() => queryBuilder(selectQueue.shift() ?? [])),
      update: vi.fn(() => updateBuilder()),
      delete: vi.fn(),
      insert: vi.fn(),
      transaction: vi.fn(),
    },
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
    adminAuditLogsTable: stub("admin_audit_logs"),
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

const account = {
  id: 7,
  name: "Ada Learner",
  email: "ada@example.test",
  role: "admin",
  activeRole: "teacher",
  educatorEnabled: true,
  teacherVerified: true,
  avatarUrl: null,
  bio: null,
  subjects: null,
  gradeOrDept: null,
  timezone: null,
  profileVisibility: "classmates",
  libraryVisibility: "classmates",
  showBio: true,
  showSubjects: true,
  showGradeOrDept: true,
  showWebsite: true,
  websiteUrl: null,
  plan: "pro",
  planExpiresAt: null,
  bannedAt: null,
  bannedReason: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", adminRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  updateRows = [];
  updatePayload = null;
  limitValues = [];
  offsetValues = [];
  auditPayload = null;
});

describe("GET /api/admin/users", () => {
  it("returns a bounded server-side page with its total", async () => {
    selectQueue = [[account], [{ value: 42 }]];

    const response = await request(buildApp()).get(
      "/api/admin/users?q=ada&role=admin&status=active&limit=1&offset=25",
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      items: [account],
      total: 42,
      limit: 1,
      offset: 25,
    });
    expect(limitValues).toEqual([1]);
    expect(offsetValues).toEqual([25]);
  });

  it("rejects ambiguous boolean filters instead of silently changing meaning", async () => {
    const response = await request(buildApp()).get(
      "/api/admin/users?educatorEnabled=maybe",
    );

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/users/:id", () => {
  it("does not accept administrator as an active workspace", async () => {
    const response = await request(buildApp())
      .patch("/api/admin/users/7")
      .send({ activeRole: "admin" });

    expect(response.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("repairs a legacy admin workspace to educator without removing authority", async () => {
    selectQueue = [[{ role: "admin", activeRole: "admin", educatorEnabled: false }]];
    updateRows = [account];

    const response = await request(buildApp())
      .patch("/api/admin/users/7")
      .send({ name: "Ada Learner" });

    expect(response.status).toBe(200);
    expect(updatePayload).toMatchObject({ activeRole: "teacher" });
    expect(updatePayload).not.toHaveProperty("activeRole", "admin");
  });
});

describe("PATCH /api/admin/users/:id/plan", () => {
  it("commits the entitlement and its human reason in one transaction", async () => {
    const tx = {
      select: vi.fn(() =>
        queryBuilder([{ plan: "free", planExpiresAt: null }]),
      ),
      update: vi.fn(() => updateBuilder()),
      insert: vi.fn(() => ({
        values: (values: Record<string, unknown>) => {
          auditPayload = values;
          return Promise.resolve();
        },
      })),
    };
    updateRows = [account];
    vi.mocked(db.transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    const response = await request(buildApp())
      .patch("/api/admin/users/7/plan")
      .send({ plan: "pro", expiresAt: null, reason: "Support grant" });

    expect(response.status).toBe(200);
    expect(updatePayload).toMatchObject({ plan: "pro", planExpiresAt: null });
    expect(auditPayload).toMatchObject({
      actorUserId: 1,
      targetUserId: 7,
      action: "account_plan_override",
      reason: "Support grant",
      beforeState: { plan: "free", planExpiresAt: null },
      afterState: { plan: "pro", planExpiresAt: null },
    });
  });
});

describe("PATCH /api/admin/users/:id/ban", () => {
  it("persists the required reason returned to later administrator views", async () => {
    updateRows = [{
      ...account,
      bannedAt: "2026-08-22T10:00:00.000Z",
      bannedReason: "Repeated harassment",
    }];

    const response = await request(buildApp())
      .patch("/api/admin/users/7/ban")
      .send({ reason: "  Repeated harassment  " });

    expect(response.status).toBe(200);
    expect(updatePayload).toMatchObject({ bannedReason: "Repeated harassment" });
    expect(response.body.bannedReason).toBe("Repeated harassment");
  });
});
