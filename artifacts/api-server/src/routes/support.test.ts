/**
 * @fileOverview Verification role: proves browser support requests validate and encrypt personal data before persistence.
 * System connection: exercises the public endpoint with a mocked database and the real encryption implementation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const insertedValues: Array<Record<string, unknown>> = [];

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues.push(values);
        return {
          returning: vi.fn().mockResolvedValue([{
            id: 73,
            status: "new",
            createdAt: "2026-08-27T12:00:00.000Z",
          }]),
        };
      }),
    })),
  },
  supportRequestsTable: {
    id: {}, status: {}, createdAt: {}, updatedAt: {},
  },
}));

vi.mock("../lib/limiters", () => ({
  contentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middlewares/requireAdmin", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import supportRouter from "./support";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", supportRouter);
  return app;
}

beforeEach(() => {
  insertedValues.length = 0;
  process.env.DATA_ENCRYPTION_KEY = "route-test-key-that-is-longer-than-thirty-two-bytes";
});

describe("POST /api/support/requests", () => {
  it("returns a receipt while persisting encrypted personal fields", async () => {
    const response = await request(buildApp()).post("/api/support/requests").send({
      email: "Learner@Example.com",
      category: "technical",
      subject: "  Search page issue  ",
      message: "  The search page stays blank after I submit a query.  ",
      device: "  Pixel 9 / Chrome  ",
      website: "",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: 73,
      status: "new",
      createdAt: "2026-08-27T12:00:00.000Z",
    });
    expect(insertedValues).toHaveLength(1);
    const stored = JSON.stringify(insertedValues[0]);
    expect(stored).not.toContain("learner@example.com");
    expect(stored).not.toContain("Search page issue");
    expect(stored).not.toContain("search page stays blank");
    expect(stored).not.toContain("Pixel 9");
    expect(insertedValues[0]).toMatchObject({ category: "technical" });
    expect(insertedValues[0].emailEncrypted).toMatch(/^enc:v1:/);
    expect(insertedValues[0].messageEncrypted).toMatch(/^enc:v1:/);
  });

  it("rejects malformed or spam-trap submissions before persistence", async () => {
    const response = await request(buildApp()).post("/api/support/requests").send({
      email: "not-an-email",
      category: "technical",
      subject: "Hi",
      message: "too short",
      website: "filled-by-a-bot",
    });

    expect(response.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });
});
