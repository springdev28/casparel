/**
 * @fileOverview Verification role: exercises Forum contract validation, moderation visibility, and administrator boundaries.
 * System connection: protects the generated Forum clients and schemas while ensuring hidden content cannot be recovered through direct-ID actions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const authState = vi.hoisted(() => ({
  accountRole: "student",
  userRole: "student",
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) =>
    new Proxy(
      { _name: name },
      {
        get(target, property) {
          if (property in target) return target[property as keyof typeof target];
          return { table: name, column: String(property) };
        },
      },
    );
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    classesTable: table("classes"),
    classMembersTable: table("class_members"),
    forumCommentsTable: table("forum_comments"),
    forumLikesTable: table("forum_likes"),
    forumMaterialApprovalsTable: table("forum_material_approvals"),
    forumMaterialsTable: table("forum_materials"),
    forumPostRepostsTable: table("forum_post_reposts"),
    forumPostsTable: table("forum_posts"),
    forumReportsTable: table("forum_reports"),
    forumSurveyVotesTable: table("forum_survey_votes"),
    userBlocksTable: table("user_blocks"),
    usersTable: table("users"),
  };
});

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    moderations: {
      create: vi.fn().mockResolvedValue({
        results: [{ flagged: false, categories: {} }],
      }),
    },
    responses: {
      create: vi.fn().mockResolvedValue({
        output_text: '{"flagged":false,"reason":"Content check passed."}',
      }),
    },
  },
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: {
      userId?: number;
      userRole?: string;
      accountRole?: string;
    },
    _res: unknown,
    next: () => void,
  ) => {
    req.userId = 42;
    req.userRole = authState.userRole;
    req.accountRole = authState.accountRole;
    next();
  },
}));

vi.mock("../lib/limiters", () => ({
  contentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { db } from "@workspace/db";
import forumRouter from "./forum";

let materialStatus = "approved";
let postStatus = "approved";
let materialOwnerId = 7;
let postAuthorId = 8;
let blockedUserIds = new Set<number>();
let updateRows: Array<Record<string, unknown>> = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", forumRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.accountRole = "student";
  authState.userRole = "student";
  materialStatus = "approved";
  postStatus = "approved";
  materialOwnerId = 7;
  postAuthorId = 8;
  blockedUserIds = new Set<number>();
  updateRows = [];

  vi.mocked(db.select).mockImplementation(
    (selection?: Record<string, unknown>) => {
      let source = "";
      const rows = () => {
        if (source === "users") {
          return [{
            id: 42,
            name: "Aylin Student",
            role: authState.userRole,
            activeRole: authState.userRole,
            teacherVerified: false,
          }];
        }
        if (source === "forum_materials") {
          if (selection && "moderationStatus" in selection) {
            return [{
              uploaderId: materialOwnerId,
              moderationStatus: materialStatus,
            }];
          }
          return [];
        }
        if (source === "forum_posts") {
          if (selection && "moderationStatus" in selection) {
            return [{
              authorId: postAuthorId,
              classId: null,
              moderationStatus: postStatus,
            }];
          }
          return [];
        }
        if (source === "user_blocks") {
          return [...blockedUserIds].map((blockedId) => ({
            blockerId: 42,
            blockedId,
          }));
        }
        return [];
      };
      const chain = {
        from: vi.fn().mockImplementation((table: { _name?: string }) => {
          source = table._name ?? "";
          return chain;
        }),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        then: (
          resolve: (value: Array<Record<string, unknown>>) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(rows()).then(resolve, reject),
      };
      return chain as unknown as ReturnType<typeof db.select>;
    },
  );

  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve([]).then(resolve, reject),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });

  vi.mocked(db.update).mockImplementation(() => {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockImplementation(() => Promise.resolve(updateRows)),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve([]).then(resolve, reject),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });
});

describe("forum contract and visibility", () => {
  it("returns capability flags through the generated response contract", async () => {
    const response = await request(buildApp()).get("/api/forum/access");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      isAdmin: false,
      teacherVerified: false,
      canApprove: false,
    });
  });

  it.each([
    "/api/forum/materials?type=executable",
    "/api/forum/materials?date=forever",
    "/api/forum/posts?classId=not-a-number",
    "/api/forum/posts?kind=announcement",
  ])("rejects an invalid feed filter before querying: %s", async (path) => {
    const response = await request(buildApp()).get(path);

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it.each([
    ["get", "/api/forum/materials/nope/file"],
    ["delete", "/api/forum/materials/0"],
    ["get", "/api/forum/posts/nope/file"],
    ["delete", "/api/forum/comments/0"],
  ] as const)("rejects an invalid ID for %s %s", async (method, path) => {
    const agent = request(buildApp());
    const response = method === "delete"
      ? await agent.delete(path)
      : await agent.get(path);

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("does not expose a hidden material file through its direct ID", async () => {
    materialStatus = "hidden";

    const response = await request(buildApp()).get(
      "/api/forum/materials/17/file",
    );

    expect(response.status).toBe(404);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("does not expose a hidden post attachment through its direct ID", async () => {
    postStatus = "hidden";

    const response = await request(buildApp()).get("/api/forum/posts/17/file");

    expect(response.status).toBe(404);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("prevents reactions from revealing or mutating hidden materials", async () => {
    materialStatus = "hidden";

    const response = await request(buildApp()).post(
      "/api/forum/material/17/like",
    );

    expect(response.status).toBe(404);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not expose a blocked user's material through a direct ID", async () => {
    blockedUserIds.add(materialOwnerId);

    const response = await request(buildApp()).get(
      "/api/forum/materials/17/file",
    );

    expect(response.status).toBe(404);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("does not expose a blocked user's post through a direct ID", async () => {
    blockedUserIds.add(postAuthorId);

    const response = await request(buildApp()).get("/api/forum/posts/17/file");

    expect(response.status).toBe(404);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed multipart material data before writing", async () => {
    const response = await request(buildApp())
      .post("/api/forum/materials")
      .field("title", "Missing topic and unit")
      .field("materialType", "notes");

    expect(response.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("keeps the report queue administrator-only", async () => {
    const response = await request(buildApp()).get("/api/forum/reports");

    expect(response.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 404 when an administrator updates a missing report", async () => {
    authState.accountRole = "admin";

    const response = await request(buildApp())
      .patch("/api/forum/reports/88")
      .send({ status: "resolved" });

    expect(response.status).toBe(404);
  });
});
