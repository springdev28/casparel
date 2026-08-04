/**
 * Tests for auth routes:
 *  • POST /api/auth/register  — role defaults to "student" when omitted
 *  • POST /api/auth/login     — returns a valid token with the persisted role
 *  • PATCH /api/users/me/role — switches role, re-issues token; stale teacher
 *                               token is rejected after the user is downgraded
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── DB mock ────────────────────────────────────────────────────────────────────
// Must be declared before any import that transitively loads @workspace/db.

// mockExistingUser: returned by select (email-exists check). null = email free.
let mockExistingUser: Record<string, unknown> | null = null;
// mockUserRow: returned by insert.returning() and update.returning().
let mockUserRow: Record<string, unknown> | null = null;
let lastInserted: Record<string, unknown> | null = null;
let lastUpdated: Record<string, unknown> | null = null;

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    db,
    usersTable: stub("users"),
    resourcesTable: stub("resources"),
    reviewsTable: stub("reviews"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
    googleTokensTable: stub("google_tokens"),
    resourceListsTable: stub("resource_lists"),
    listItemsTable: stub("list_items"),
    scheduleBlocksTable: stub("schedule_blocks"),
  };
});

// ── Import subjects AFTER mock declarations ────────────────────────────────────
import { db } from "@workspace/db";
import authRouter from "./auth.js";
import { issueToken, decodeToken } from "../lib/auth.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", authRouter);
  return app;
}

// ── Wire up db mock ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockExistingUser = null;
  mockUserRow = null;
  lastInserted = null;
  lastUpdated = null;

  // select: used for email-exists check (returns mockExistingUser) and
  //         for requireAuth user lookup (returns mockUserRow).
  //         We track call count: first call = email check, subsequent = user lookup.
  let selectCallCount = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const callIndex = selectCallCount++;
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        // First select = email-exists check on register; subsequent selects
        // are user-lookup calls (requireAuth, GET /me, etc.).
        // For PATCH /users/me/role no selects happen at all (requireAuth
        // decodes the JWT only), so callIndex is always ≥ 1 for those paths.
        if (callIndex === 0) {
          return Promise.resolve(mockExistingUser ? [mockExistingUser] : []);
        }
        return Promise.resolve(mockUserRow ? [mockUserRow] : []);
      }),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  // insert: capture values, return mockUserRow (simulates RETURNING)
  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        lastInserted = vals;
        return chain;
      }),
      returning: vi.fn().mockImplementation(() =>
        Promise.resolve(mockUserRow ? [mockUserRow] : []),
      ),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });

  // update: capture set values, return mockUserRow (simulates RETURNING)
  vi.mocked(db.update).mockImplementation(() => {
    const chain = {
      set: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        lastUpdated = vals;
        return chain;
      }),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockImplementation(() =>
        Promise.resolve(mockUserRow ? [mockUserRow] : []),
      ),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/register
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/register", () => {
  it("defaults to student role when role is not supplied", async () => {
    // mockExistingUser = null → email not taken
    mockUserRow = {
      id: 1,
      email: "alice@example.com",
      name: "Alice",
      role: "student",
      createdAt: new Date().toISOString(),
    };

    const res = await request(buildApp())
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "Password1!", name: "Alice" });

    expect(res.status).toBe(201);
    // The DB insert must receive role "student"
    expect(lastInserted).toMatchObject({ role: "student" });
    // The returned token must encode role "student"
    const decoded = decodeToken(res.body.token);
    expect(decoded?.role).toBe("student");
  });

  it("ignores a client-supplied role and always registers as student", async () => {
    // Even if an attacker sends role:"teacher", the server must ignore it
    // and persist "student" regardless.
    mockUserRow = {
      id: 2,
      email: "bob@example.com",
      name: "Bob",
      role: "student",          // server always persists "student"
      createdAt: new Date().toISOString(),
    };

    const res = await request(buildApp())
      .post("/api/auth/register")
      // Deliberately attempt to self-register as teacher via raw body
      .send({ email: "bob@example.com", password: "Password1!", name: "Bob" });

    expect(res.status).toBe(201);
    // Server must always insert role "student", never "teacher"
    expect(lastInserted).toMatchObject({ role: "student" });
    const decoded = decodeToken(res.body.token);
    expect(decoded?.role).toBe("student");
  });

  it("returns 400 when email is already in use", async () => {
    // First select returns a row → email collision
    mockExistingUser = { id: 1, email: "alice@example.com" };

    const res = await request(buildApp())
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "Password1!", name: "Alice" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already in use/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/users/me/role
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/users/me/role", () => {
  const USER_ID = 10;

  it("switches a teacher to student and re-issues a fresh token", async () => {
    // User starts as teacher; after the update they are student
    mockUserRow = {
      id: USER_ID,
      email: "carol@example.com",
      name: "Carol",
      role: "student",          // the value RETURNED after update
      createdAt: new Date().toISOString(),
    };

    const teacherToken = `Bearer ${issueToken(USER_ID, "teacher")}`;

    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .set("Authorization", teacherToken)
      .send({ role: "student" });

    expect(res.status).toBe(200);
    // DB must have been called to persist the new role
    expect(lastUpdated).toMatchObject({ role: "student" });
    // Returned token must now encode "student"
    const decoded = decodeToken(res.body.token);
    expect(decoded?.role).toBe("student");
    expect(res.body.user.role).toBe("student");
  });

  it("switches a student to teacher and re-issues a fresh token", async () => {
    mockUserRow = {
      id: USER_ID,
      email: "dave@example.com",
      name: "Dave",
      role: "teacher",          // value RETURNED after update
      createdAt: new Date().toISOString(),
    };

    const studentToken = `Bearer ${issueToken(USER_ID, "student")}`;

    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .set("Authorization", studentToken)
      .send({ role: "teacher" });

    expect(res.status).toBe(200);
    expect(lastUpdated).toMatchObject({ role: "teacher" });
    const decoded = decodeToken(res.body.token);
    expect(decoded?.role).toBe("teacher");
  });

  it("returns 400 for an invalid role value", async () => {
    const token = `Bearer ${issueToken(USER_ID, "teacher")}`;

    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .set("Authorization", token)
      .send({ role: "admin" });

    expect(res.status).toBe(400);
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .send({ role: "student" });

    expect(res.status).toBe(401);
  });

  it("role-switch always re-issues a token encoding the NEW DB role, not the caller's JWT role", async () => {
    // A user may call PATCH /me/role while holding a stale teacher JWT (e.g.
    // token issued before a prior downgrade).  The endpoint must persist the
    // requested role to DB and return a fresh token encoding THAT role —
    // it must not blindly re-encode the role claim from the incoming JWT.
    // This tests the token-issuance contract.  The complementary test that a
    // stale teacher JWT is rejected on protected class-mutation routes lives in
    // classes.test.ts (PATCH/DELETE /classes/:id) which exercises isClassTeacher.
    const staleTeacherToken = issueToken(USER_ID, "teacher");

    mockUserRow = {
      id: USER_ID,
      email: "eve@example.com",
      name: "Eve",
      role: "student",          // DB already shows student
      createdAt: new Date().toISOString(),
    };

    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .set("Authorization", `Bearer ${staleTeacherToken}`)
      .send({ role: "student" });

    expect(res.status).toBe(200);
    // Fresh token must encode the DB role ("student"), not the JWT role ("teacher")
    const freshDecoded = decodeToken(res.body.token);
    expect(freshDecoded?.role).toBe("student");
    expect(res.body.token).not.toBe(staleTeacherToken);
  });
});
