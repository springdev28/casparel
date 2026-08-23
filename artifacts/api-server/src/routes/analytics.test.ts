/**
 * @fileOverview Verification role: exercises Analytics.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.userId = 42;
    req.userRole = "student";
    req.accountRole = "student";
    next();
  },
}));

vi.mock("../lib/workflowAnalytics", () => ({
  recordWorkflowEvent: vi.fn().mockResolvedValue(undefined),
}));

import { recordWorkflowEvent } from "../lib/workflowAnalytics";
import analyticsRouter from "./analytics";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", analyticsRouter);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/analytics/events", () => {
  it("records an allowlisted event and strips unknown context", async () => {
    const response = await request(buildApp())
      .post("/api/analytics/events")
      .send({
        event: "search_result_opened",
        context: {
          surface: "resource_search",
          position: 2,
          query: "sensitive search text",
        },
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true });
    expect(recordWorkflowEvent).toHaveBeenCalledWith({
      userId: 42,
      event: "search_result_opened",
      resourceId: undefined,
      context: { surface: "resource_search", position: 2 },
    });
  });

  it("rejects arbitrary client-defined event names", async () => {
    const response = await request(buildApp())
      .post("/api/analytics/events")
      .send({ event: "student_answer_submitted" });

    expect(response.status).toBe(400);
    expect(recordWorkflowEvent).not.toHaveBeenCalled();
  });

  it("accepts classified client reliability data but strips raw error details", async () => {
    const response = await request(buildApp())
      .post("/api/analytics/events")
      .send({
        event: "client_error_observed",
        context: {
          source: "react_boundary",
          errorKind: "type_error",
          routeGroup: "resources",
          message: "private learner content",
          stack: "private stack and URL",
        },
      });

    expect(response.status).toBe(202);
    expect(recordWorkflowEvent).toHaveBeenCalledWith({
      userId: 42,
      event: "client_error_observed",
      resourceId: undefined,
      context: {
        source: "react_boundary",
        errorKind: "type_error",
        routeGroup: "resources",
      },
    });
  });

  it("rejects invalid Web Vital names and out-of-range values", async () => {
    const response = await request(buildApp())
      .post("/api/analytics/events")
      .send({
        event: "web_vital_measured",
        context: { metric: "SECRET_METRIC", value: -1 },
      });

    expect(response.status).toBe(400);
    expect(recordWorkflowEvent).not.toHaveBeenCalled();
  });
});
