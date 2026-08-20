/**
 * Tests for GET /healthz reporting schema state.
 *
 * Startup keeps serving when migrations fail, so "ok" on its own is misleading:
 * the app answers requests while any query touching a not-yet-migrated column
 * breaks. These assertions pin that a failed migration is actually reported.
 */
import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

import healthRouter from "./health.js";
import {
  markSchemaFailed,
  markSchemaReady,
  getSchemaHealth,
} from "../lib/schemaHealth.js";
import { resetAiHealth, throughAi } from "../lib/aiHealth.js";

function buildApp() {
  const app = express();
  app.use("/api", healthRouter);
  return app;
}

describe("GET /api/healthz", () => {
  beforeEach(() => {
    markSchemaReady();
    resetAiHealth();
  });

  it("reports ok and a ready schema once migrations applied", async () => {
    const res = await request(buildApp()).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.schema.state).toBe("ready");
    expect(res.body.schema.error).toBeUndefined();
  });

  it("returns 503 and names the failure when migrations did not apply", async () => {
    markSchemaFailed(new Error('column "verified_at" does not exist'));
    const res = await request(buildApp()).get("/api/healthz");
    expect(res.status).toBe(503);
    expect(res.body.schema.state).toBe("failed");
    expect(res.body.schema.error).toContain("verified_at");
  });

  it("keeps the contract's status field intact even while degraded", async () => {
    markSchemaFailed(new Error("boom"));
    const res = await request(buildApp()).get("/api/healthz");
    expect(res.body.status).toBe("ok");
    expect(getSchemaHealth().state).toBe("failed");
  });

  it("says nothing about the AI provider until something has used it", async () => {
    const res = await request(buildApp()).get("/api/healthz");
    // `reason` is what makes the two kinds of "unknown" readable without an
    // inference: nothing attempted yet, or a result that has aged out.
    expect(res.body.ai).toEqual({
      state: "unknown",
      reason: "never-attempted",
      checkedAt: null,
    });
  });

  it("reports a failing AI provider, and which call saw it", async () => {
    await expect(
      throughAi("deep source review", async () => {
        throw Object.assign(new Error("Connection error."), { status: 502 });
      }),
    ).rejects.toThrow();

    const res = await request(buildApp()).get("/api/healthz");
    expect(res.body.ai.state).toBe("failing");
    expect(res.body.ai.lastOperation).toBe("deep source review");
    expect(res.body.ai.error).toContain("Connection error");
  });

  it("stays healthy while the AI provider is not", async () => {
    // The catalog, classes, schedules and the quick source check all work
    // without AI. A load balancer must not pull the server for an optional
    // feature: that turns a degraded product into no product.
    await expect(
      throughAi("discovery", async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow();

    const res = await request(buildApp()).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.ai.state).toBe("failing");
  });
});
