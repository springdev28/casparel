/**
 * @fileOverview Verification role: exercises resumable learning-workflow API contracts and per-user dismissal behavior.
 * System connection: protects the generated workflow clients used by resource details and the adaptive dashboard continuation queue.
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
    req.userRole = "teacher";
    req.accountRole = "teacher";
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
import { recordWorkflowEvent } from "../lib/workflowAnalytics";
import learningWorkflowRouter from "./learningWorkflow";

const RESOURCE_ID = 12;
const NOW = "2026-08-22T14:00:00.000Z";

let resourceRows: Array<Record<string, unknown>> = [];
let workflowRows: Array<Record<string, unknown>> = [];
let listItemRows: Array<Record<string, unknown>> = [];

function journeyEvent(
  event: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    event,
    resourceId: RESOURCE_ID,
    resourceTitle: "Fractions guide",
    resourceSubject: "Mathematics",
    resourceFormat: "article",
    activityId: null,
    activityTitle: null,
    classId: null,
    className: null,
    assignmentId: null,
    assignmentTitle: null,
    createdAt: NOW,
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", learningWorkflowRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  resourceRows = [{ id: RESOURCE_ID }];
  workflowRows = [];
  listItemRows = [];

  vi.mocked(db.select).mockImplementation(() => {
    let tableName = "";
    const chain = {
      from: vi.fn().mockImplementation((table: { _name: string }) => {
        tableName = table._name;
        return chain;
      }),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        const rows = tableName === "resources"
          ? resourceRows
          : tableName === "workflow_events"
            ? workflowRows
            : tableName === "list_items"
              ? listItemRows
              : [];
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  vi.mocked(db.delete).mockImplementation(() => {
    const chain = {
      where: vi.fn().mockResolvedValue(undefined),
    };
    return chain as unknown as ReturnType<typeof db.delete>;
  });
});

describe("learning workflow continuation contract", () => {
  it("derives a teacher's next resource action through the generated response schema", async () => {
    workflowRows = [
      journeyEvent("class_shared", { classId: 7, className: "Algebra A" }),
      journeyEvent("activity_created", { activityId: 18, activityTitle: "Fraction cards" }),
      journeyEvent("resource_reviewed"),
    ];
    listItemRows = [{ id: 4 }];

    const response = await request(buildApp()).get(
      `/api/workflow/resources/${RESOURCE_ID}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      resourceId: RESOURCE_ID,
      steps: {
        reviewed: true,
        saved: true,
        activityCreated: true,
        classShared: true,
        assignmentCreated: false,
      },
      nextAction: "assign_class",
      assignmentRequired: true,
      activity: { id: 18, title: "Fraction cards" },
      classShare: { id: 7, name: "Algebra A" },
      assignment: null,
    });
    expect(recordWorkflowEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "resource_saved",
      resourceId: RESOURCE_ID,
    }));
  });

  it("returns only actionable, incomplete journeys in the continuation queue", async () => {
    workflowRows = [
      journeyEvent("class_shared", { classId: 7, className: "Algebra A" }),
      journeyEvent("activity_created", { activityId: 18, activityTitle: "Fraction cards" }),
      journeyEvent("resource_saved"),
      journeyEvent("resource_reviewed"),
      journeyEvent("resource_viewed", {
        resourceId: 99,
        resourceTitle: "Viewed only",
      }),
      journeyEvent("assignment_created", {
        resourceId: 77,
        resourceTitle: "Already complete",
        assignmentId: 31,
        assignmentTitle: "Final task",
      }),
      journeyEvent("class_shared", { resourceId: 77, classId: 8, className: "Complete class" }),
      journeyEvent("activity_created", { resourceId: 77, activityId: 19, activityTitle: "Complete cards" }),
      journeyEvent("resource_saved", { resourceId: 77 }),
      journeyEvent("resource_reviewed", { resourceId: 77 }),
    ];

    const response = await request(buildApp()).get("/api/workflow/continue");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      resourceId: RESOURCE_ID,
      title: "Fractions guide",
      subject: "Mathematics",
      format: "article",
      lastEventAt: NOW,
      steps: {
        reviewed: true,
        saved: true,
        activityCreated: true,
        classShared: true,
        assignmentCreated: false,
      },
      nextAction: "assign_class",
      completedSteps: 4,
      totalSteps: 5,
      activity: { id: 18, title: "Fraction cards" },
      classShare: { id: 7, name: "Algebra A" },
      assignment: null,
    }]);
  });

  it("returns 404 when workflow state is requested for a missing resource", async () => {
    resourceRows = [];

    const response = await request(buildApp()).get(
      `/api/workflow/resources/${RESOURCE_ID}`,
    );

    expect(response.status).toBe(404);
    expect(recordWorkflowEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["resource state", "/api/workflow/resources/not-a-number", "get"],
    ["dismissal", "/api/workflow/continue/0", "delete"],
  ] as const)("rejects an invalid resource ID for %s before querying", async (_label, path, method) => {
    const agent = request(buildApp());
    const response = method === "get"
      ? await agent.get(path)
      : await agent.delete(path);

    expect(response.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("dismisses only the current user's resource journey", async () => {
    const response = await request(buildApp()).delete(
      `/api/workflow/continue/${RESOURCE_ID}`,
    );

    expect(response.status).toBe(204);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });
});
