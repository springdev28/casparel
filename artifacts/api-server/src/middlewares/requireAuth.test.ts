/**
 * Tests for requireAuth's allowlisted-admin promotion:
 *  • an allowlisted email on a non-admin row is promoted on any request
 *  • a non-allowlisted email is never promoted
 *  • an already-admin allowlisted account is not written again
 *  • banned accounts are still rejected before any promotion happens
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let mockUserRow: Record<string, unknown> | null = null;
let updateMock: ReturnType<typeof vi.fn>;
let setMock: ReturnType<typeof vi.fn>;

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { select: vi.fn(), update: vi.fn() },
    usersTable: stub("users"),
  };
});

import { db } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "./requireAuth.js";
import { issueToken } from "../lib/auth.js";

const ALLOWLISTED = "baharyuksel0403@gmail.com";
const OUTSIDER = "someone.else@example.com";
const USER_ID = 7;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get("/whoami", requireAuth, (req, res) => {
    const r = req as AuthenticatedRequest;
    res.json({ userId: r.userId, accountRole: r.accountRole, userRole: r.userRole });
  });
  return app;
}

function callWhoami() {
  return request(buildApp())
    .get("/whoami")
    .set("Authorization", `Bearer ${issueToken(USER_ID, "student")}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserRow = {
    id: USER_ID,
    email: OUTSIDER,
    role: "student",
    activeRole: "student",
    bannedAt: null,
  };

  vi.mocked(db.select).mockImplementation(
    () =>
      ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => Promise.resolve(mockUserRow ? [mockUserRow] : [])),
      }) as unknown as ReturnType<typeof db.select>,
  );

  setMock = vi.fn(() => ({
    where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ role: "admin" }]) })),
  }));
  updateMock = vi.fn(() => ({ set: setMock }));
  vi.mocked(db.update).mockImplementation(updateMock as unknown as typeof db.update);
});

describe("requireAuth admin promotion", () => {
  it("promotes an allowlisted email that is not yet admin", async () => {
    mockUserRow = { ...mockUserRow, email: ALLOWLISTED, role: "student" };
    const res = await callWhoami();
    expect(res.status).toBe(200);
    expect(res.body.accountRole).toBe("admin");
    expect(setMock).toHaveBeenCalledWith({ role: "admin" });
  });

  it("does not promote a non-allowlisted email", async () => {
    const res = await callWhoami();
    expect(res.status).toBe(200);
    expect(res.body.accountRole).toBe("student");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not re-write an account that is already admin", async () => {
    mockUserRow = { ...mockUserRow, email: ALLOWLISTED, role: "admin" };
    const res = await callWhoami();
    expect(res.status).toBe(200);
    expect(res.body.accountRole).toBe("admin");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a banned account without promoting it", async () => {
    mockUserRow = {
      ...mockUserRow,
      email: ALLOWLISTED,
      role: "student",
      bannedAt: new Date().toISOString(),
    };
    const res = await callWhoami();
    expect(res.status).toBe(423);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("401s when the user row is missing", async () => {
    mockUserRow = null;
    const res = await callWhoami();
    expect(res.status).toBe(401);
  });
});
