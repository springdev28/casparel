/**
 * @fileOverview Verification role: exercises the Study Activities API contract and its validation boundary.
 * System connection: protects the generated OpenAPI schemas used by the route and frontend client from drifting apart.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

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
    },
    forumMaterialsTable: table("forum_materials"),
    forumPostsTable: table("forum_posts"),
    resourcesTable: table("resources"),
    studyActivitiesTable: table("study_activities"),
    usersTable: table("users"),
    workflowEventsTable: table("workflow_events"),
  };
});

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
    req.userRole = "student";
    req.accountRole = "student";
    next();
  },
}));

vi.mock("../lib/limiters", () => ({
  contentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/authz", () => ({
  isClassMember: vi.fn().mockResolvedValue(true),
  isClassTeacher: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/workflowAnalytics", () => ({
  recordWorkflowEvent: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@workspace/db";
import studyActivitiesRouter from "./studyActivities";

const activity = {
  id: 17,
  ownerId: 42,
  workspaceRole: "student",
  classId: null,
  title: "Fraction review",
  subject: "Mathematics",
  mode: "flashcards",
  shareToken: null,
  cards: [
    { id: "card-1", term: "1/2", answer: "0.5" },
    { id: "card-2", term: "1/4", answer: "0.25" },
  ],
  createdAt: "2026-08-21T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};
let insertedValues: Record<string, unknown> | null = null;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", studyActivitiesRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedValues = null;
  vi.mocked(db.select).mockImplementation(() => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve([activity]).then(resolve, reject),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });
  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        insertedValues = values;
        return chain;
      }),
      returning: vi.fn().mockImplementation(() => Promise.resolve([{
        id: activity.id,
        shareToken: null,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
        ...insertedValues,
      }])),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });
});

describe("study activity contract", () => {
  it("returns activities through the generated response schema", async () => {
    const response = await request(buildApp()).get("/api/study-activities");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([activity]);
  });

  it("rejects an invalid class filter before querying the database", async () => {
    const response = await request(buildApp()).get(
      "/api/study-activities?classId=not-a-number",
    );

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects a malformed public share token before querying the database", async () => {
    const response = await request(buildApp()).get(
      "/api/study-activities/shared/short!",
    );

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("exposes only the public response fields for a valid share token", async () => {
    const response = await request(buildApp()).get(
      `/api/study-activities/shared/${"a".repeat(24)}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: activity.id,
      classId: null,
      title: activity.title,
      cards: activity.cards,
    });
    expect(response.body).not.toHaveProperty("ownerId");
    expect(response.body).not.toHaveProperty("workspaceRole");
    expect(response.body).not.toHaveProperty("shareToken");
  });

  it("creates a valid activity through the generated request and response schemas", async () => {
    const response = await request(buildApp())
      .post("/api/study-activities")
      .send({
        title: activity.title,
        subject: activity.subject,
        mode: activity.mode,
        cards: activity.cards,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: activity.id,
      ownerId: 42,
      workspaceRole: "student",
      title: activity.title,
      cards: activity.cards,
    });
    expect(insertedValues).toMatchObject({
      ownerId: 42,
      workspaceRole: "student",
      classId: null,
      title: activity.title,
    });
  });

  it("rejects an incomplete activity before writing to the database", async () => {
    const response = await request(buildApp())
      .post("/api/study-activities")
      .send({
        title: "Only one card",
        cards: [{ term: "Question", answer: "Answer" }],
      });

    expect(response.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("applies mode-specific rules after structural contract validation", async () => {
    const response = await request(buildApp())
      .post("/api/study-activities")
      .send({
        title: "Missing word practice",
        mode: "missing-word",
        cards: activity.cards,
      });

    expect(response.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an unsupported publish destination before reading activity data", async () => {
    const response = await request(buildApp())
      .post("/api/study-activities/17/publish")
      .send({ destination: "private-message" });

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it.each([
    ["patch", "/api/study-activities/not-a-number"],
    ["delete", "/api/study-activities/0"],
  ] as const)("rejects an invalid id for %s", async (method, path) => {
    const agent = request(buildApp());
    const response = method === "patch"
      ? await agent.patch(path).send({
          title: activity.title,
          subject: activity.subject,
          mode: activity.mode,
          cards: activity.cards,
        })
      : await agent.delete(path);

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});
