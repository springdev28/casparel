/**
 * @fileOverview Verification role: exercises Learning Evidence.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

let ownedGoalIds = new Set<number>();
let insertedEvidence: Record<string, unknown> | null = null;
let existingEvidence: Record<string, unknown> | null = null;
let conflictOnInsert = false;

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
    usersTable: stub("users"),
    learningGoalsTable: stub("learning_goals"),
    learningEvidenceTable: stub("learning_evidence"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
  };
});

import { db } from "@workspace/db";
import { issueToken } from "../lib/auth.js";
import learningEvidenceRouter from "./learningEvidence.js";

const USER_ID = 42;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", learningEvidenceRouter);
  return app;
}

function authHeader() {
  return `Bearer ${issueToken(USER_ID, "student")}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  ownedGoalIds = new Set([8]);
  insertedEvidence = null;
  existingEvidence = null;
  conflictOnInsert = false;

  vi.mocked(db.select).mockImplementation(() => {
    let tableName = "";
    const chain = {
      from: vi.fn().mockImplementation((table: { _name: string }) => {
        tableName = table._name;
        return chain;
      }),
      where: vi.fn().mockImplementation(() => {
        if (tableName === "users") {
          return Promise.resolve([{
            id: USER_ID,
            email: "learner@example.com",
            role: "student",
            activeRole: "student",
            educatorEnabled: false,
            bannedAt: null,
          }]);
        }
        if (tableName === "learning_goals") {
          return Promise.resolve(ownedGoalIds.size ? [{
            id: [...ownedGoalIds][0],
            pathSteps: [{ id: "fractions-step", title: "Equivalent fractions" }],
          }] : []);
        }
        if (tableName === "learning_evidence") {
          return Promise.resolve(existingEvidence ? [existingEvidence] : []);
        }
        return Promise.resolve([]);
      }),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        insertedEvidence = values;
        return chain;
      }),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockImplementation(() => {
        if (conflictOnInsert) {
          existingEvidence = {
            id: 78,
            ...insertedEvidence,
            createdAt: "2026-08-22T11:00:00.000Z",
          };
          return Promise.resolve([]);
        }
        return Promise.resolve([{
          id: 91,
          ...insertedEvidence,
          createdAt: "2026-08-22T11:00:00.000Z",
        }]);
      }),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });

  vi.mocked(db.update).mockImplementation(() => {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });
});

describe("POST /api/learning-evidence", () => {
  const evidenceInput = {
    concept: "Equivalent fractions",
    confidence: 2,
    understanding: 3,
    reflection: "I can explain the visual model.",
  };

  it("records evidence against a goal owned by the current user", async () => {
    const response = await request(buildApp())
      .post("/api/learning-evidence")
      .set("Authorization", authHeader())
      .send({
        ...evidenceInput,
        learningGoalId: 8,
        pathStepId: "fractions-step",
        studyDurationSeconds: 900,
        clientSubmissionId: "mobile-evidence-1234",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 91,
      userId: USER_ID,
      learningGoalId: 8,
      pathStepId: "fractions-step",
      studyDurationSeconds: 900,
      concept: "Equivalent fractions",
    });
    expect(insertedEvidence).toMatchObject({
      userId: USER_ID,
      learningGoalId: 8,
      pathStepId: "fractions-step",
      clientSubmissionId: "mobile-evidence-1234",
    });
  });

  it("rejects evidence linked to a goal the current user does not own", async () => {
    ownedGoalIds.clear();

    const response = await request(buildApp())
      .post("/api/learning-evidence")
      .set("Authorization", authHeader())
      .send({ ...evidenceInput, learningGoalId: 999 });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Learning goal access required");
    expect(insertedEvidence).toBeNull();
  });

  it("still permits a standalone check-in without a goal", async () => {
    const response = await request(buildApp())
      .post("/api/learning-evidence")
      .set("Authorization", authHeader())
      .send(evidenceInput);

    expect(response.status).toBe(201);
    expect(response.body.learningGoalId).toBeNull();
  });

  it("returns the existing record for a repeated client submission", async () => {
    existingEvidence = {
      id: 77,
      userId: USER_ID,
      learningGoalId: 8,
      resourceId: null,
      pathStepId: "fractions-step",
      studyDurationSeconds: 900,
      clientSubmissionId: "mobile-evidence-1234",
      concept: evidenceInput.concept,
      confidence: evidenceInput.confidence,
      understanding: evidenceInput.understanding,
      reflection: evidenceInput.reflection,
      misconception: null,
      createdAt: "2026-08-22T10:00:00.000Z",
    };

    const response = await request(buildApp())
      .post("/api/learning-evidence")
      .set("Authorization", authHeader())
      .send({
        ...evidenceInput,
        learningGoalId: 8,
        pathStepId: "fractions-step",
        studyDurationSeconds: 900,
        clientSubmissionId: "mobile-evidence-1234",
      });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(77);
    expect(insertedEvidence).toBeNull();
  });

  it("rejects reuse of a submission key for different evidence", async () => {
    existingEvidence = {
      id: 77,
      userId: USER_ID,
      learningGoalId: 8,
      resourceId: null,
      pathStepId: "fractions-step",
      studyDurationSeconds: 900,
      clientSubmissionId: "mobile-evidence-1234",
      concept: evidenceInput.concept,
      confidence: evidenceInput.confidence,
      understanding: evidenceInput.understanding,
      reflection: evidenceInput.reflection,
      misconception: null,
      createdAt: "2026-08-22T10:00:00.000Z",
    };

    const response = await request(buildApp())
      .post("/api/learning-evidence")
      .set("Authorization", authHeader())
      .send({
        ...evidenceInput,
        concept: "A different concept",
        learningGoalId: 8,
        pathStepId: "fractions-step",
        clientSubmissionId: "mobile-evidence-1234",
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Submission key already belongs to different evidence");
    expect(insertedEvidence).toBeNull();
  });

  it("rejects a path-step id that does not belong to the owned goal", async () => {
    const response = await request(buildApp())
      .post("/api/learning-evidence")
      .set("Authorization", authHeader())
      .send({ ...evidenceInput, learningGoalId: 8, pathStepId: "other-step" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Learning path step not found");
    expect(insertedEvidence).toBeNull();
  });

  it("returns the canonical evidence when a concurrent retry wins the insert race", async () => {
    conflictOnInsert = true;

    const response = await request(buildApp())
      .post("/api/learning-evidence")
      .set("Authorization", authHeader())
      .send({
        ...evidenceInput,
        learningGoalId: 8,
        pathStepId: "fractions-step",
        clientSubmissionId: "mobile-evidence-race",
      });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(78);
    expect(insertedEvidence).toMatchObject({ clientSubmissionId: "mobile-evidence-race" });
  });
});
