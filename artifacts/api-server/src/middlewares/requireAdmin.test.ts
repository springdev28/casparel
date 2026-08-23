/**
 * @fileOverview Verification role: proves guessed administrator routes reject authenticated non-administrators before handlers can read data.
 * System connection: exercises requireAdmin, the common authorization boundary mounted on every /admin operation.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

let resolvedRole = "student";

vi.mock("./requireAuth", () => ({
  requireAuth: (
    req: { accountRole?: string },
    _res: unknown,
    next: () => void,
  ) => {
    req.accountRole = resolvedRole;
    next();
  },
}));

import { requireAdmin } from "./requireAdmin.js";

function buildApp() {
  const app = express();
  app.get("/api/admin/users", requireAdmin, (_req, res) => {
    res.json({ leaked: true });
  });
  return app;
}

beforeEach(() => {
  resolvedRole = "student";
});

describe("requireAdmin", () => {
  it("rejects a non-admin who guesses an administrator data route", async () => {
    const response = await request(buildApp()).get("/api/admin/users");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Administrator access required" });
    expect(response.body).not.toHaveProperty("leaked");
  });

  it("continues only for platform administrators", async () => {
    resolvedRole = "admin";

    const response = await request(buildApp()).get("/api/admin/users");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ leaked: true });
  });
});
