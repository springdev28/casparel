/**
 * @fileOverview Verification role: exercises Health.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
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

function buildApp() {
  const app = express();
  app.use("/api", healthRouter);
  return app;
}

describe("GET /api/healthz", () => {
  beforeEach(() => {
    markSchemaReady();
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
});
