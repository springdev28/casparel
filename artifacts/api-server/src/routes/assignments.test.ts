/**
 * @fileOverview Verification role: exercises the Class Assignments API contract and its authorization-aware validation boundary.
 * System connection: protects generated assignment clients and schemas used by class work, learner completion, and dashboard queues.
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
    assignmentCompletionsTable: table("assignment_completions"),
    classAssignmentsTable: table("class_assignments"),
    classMembersTable: table("class_members"),
    classesTable: table("classes"),
    listItemsTable: table("list_items"),
    resourceListsTable: table("resource_lists"),
    resourcesTable: table("resources"),
    studyActivitiesTable: table("study_activities"),
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
  isClassTeacher: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/workflowAnalytics", () => ({
  recordWorkflowEvent: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@workspace/db";
import learningWorkflowRouter from "./learningWorkflow";

const assignment = {
  id: 27,
  classId: 5,
  createdById: 42,
  title: "Review equivalent fractions",
  instructions: "Complete the linked practice.",
  resourceId: 9,
  activityId: null,
  dueAt: "2026-08-25T12:00:00.000Z",
  createdAt: "2026-08-22T12:00:00.000Z",
};

const assignmentView = {
  id: assignment.id,
  classId: assignment.classId,
  title: assignment.title,
  instructions: assignment.instructions,
  resourceId: assignment.resourceId,
  activityId: assignment.activityId,
  dueAt: assignment.dueAt,
  createdAt: assignment.createdAt,
  resourceTitle: "Fractions guide",
  resourceUrl: "https://example.com/fractions",
  activityTitle: null,
  completedAt: null,
};

let selectedRows: Array<Array<Record<string, unknown>>> = [];
let insertedValues: Record<string, unknown> | null = null;
let deletedRows: Array<Record<string, unknown>> = [{ id: assignment.id }];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", learningWorkflowRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectedRows = [];
  insertedValues = null;
  deletedRows = [{ id: assignment.id }];

  vi.mocked(db.select).mockImplementation(() => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(selectedRows.shift() ?? []).then(resolve, reject),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        insertedValues = values;
        return chain;
      }),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockImplementation(() => Promise.resolve([{
        id: assignment.id,
        createdAt: assignment.createdAt,
        ...insertedValues,
      }])),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });

  vi.mocked(db.delete).mockImplementation(() => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockImplementation(() => Promise.resolve(deletedRows)),
      then: (resolve: (value: undefined) => unknown) =>
        Promise.resolve(undefined).then(resolve),
    };
    return chain as unknown as ReturnType<typeof db.delete>;
  });
});

describe("class assignment contract", () => {
  it("returns class assignments through the generated response schema", async () => {
    selectedRows = [[assignmentView]];

    const response = await request(buildApp()).get(
      `/api/classes/${assignment.classId}/assignments`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ ...assignmentView, completed: false }]);
  });

  it("creates a standalone assignment through the generated schemas", async () => {
    const response = await request(buildApp())
      .post(`/api/classes/${assignment.classId}/assignments`)
      .send({
        title: "  Independent reflection  ",
        instructions: "  Explain your strategy.  ",
        dueAt: null,
        resourceId: null,
        activityId: null,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: assignment.id,
      classId: assignment.classId,
      createdById: 42,
      title: "Independent reflection",
      instructions: "Explain your strategy.",
    });
    expect(insertedValues).toMatchObject({
      classId: assignment.classId,
      createdById: 42,
      resourceId: null,
      activityId: null,
    });
  });

  it("marks an accessible assignment complete", async () => {
    selectedRows = [[assignment]];

    const response = await request(buildApp())
      .patch(`/api/assignments/${assignment.id}/completion`)
      .send({ completed: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ completed: true });
    expect(insertedValues).toEqual({ assignmentId: assignment.id, userId: 42 });
  });

  it("returns an empty today queue when the learner has no class memberships", async () => {
    selectedRows = [[]];

    const response = await request(buildApp()).get("/api/assignments/today");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns bounded teacher analytics through the generated schema", async () => {
    selectedRows = [
      [{ studentCount: 4 }],
      [{
        id: assignment.id,
        title: assignment.title,
        dueAt: assignment.dueAt,
        completions: 3,
      }],
    ];

    const response = await request(buildApp()).get(
      `/api/classes/${assignment.classId}/analytics`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      studentCount: 4,
      assignments: [{
        id: assignment.id,
        title: assignment.title,
        dueAt: assignment.dueAt,
        completions: 3,
        completionRate: 75,
      }],
    });
  });

  it.each([
    ["list", "get", "/api/classes/not-a-number/assignments", undefined],
    ["create", "post", "/api/classes/0/assignments", { title: "Valid title" }],
    ["delete", "delete", "/api/classes/5/assignments/nope", undefined],
    ["completion", "patch", "/api/assignments/nope/completion", { completed: true }],
    ["analytics", "get", "/api/classes/0/analytics", undefined],
  ] as const)("rejects an invalid ID for %s before querying", async (_label, method, path, body) => {
    const agent = request(buildApp());
    const response = method === "get"
      ? await agent.get(path)
      : method === "post"
        ? await agent.post(path).send(body)
        : method === "patch"
          ? await agent.patch(path).send(body)
          : await agent.delete(path);

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects linking both a resource and activity", async () => {
    const response = await request(buildApp())
      .post(`/api/classes/${assignment.classId}/assignments`)
      .send({
        title: assignment.title,
        resourceId: 9,
        activityId: 17,
      });

    expect(response.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean completion state before querying", async () => {
    const response = await request(buildApp())
      .patch(`/api/assignments/${assignment.id}/completion`)
      .send({ completed: "yes" });

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});
