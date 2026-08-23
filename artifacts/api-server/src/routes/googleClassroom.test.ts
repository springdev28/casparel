/**
 * @fileOverview Verification role: exercises Google Classroom.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Integration tests for Google Classroom routes.
 *
 * All Google API calls and DB access are fully mocked, no real network or
 * database required.  The tests cover:
 *
 *  • GET  /api/google-classroom/courses, valid token, expired token (auto-refresh),
 *                                          revoked token (no refresh_token → 401)
 *  • POST /api/google-classroom/share  , successful announcement post
 *  • GET  /api/auth/google/callback    , expired OAuth state, tampered OAuth state
 */

import { describe, it, vi, beforeEach, expect } from "vitest";
import request from "supertest";
import express from "express";
import crypto from "node:crypto";

// ── DB mock ───────────────────────────────────────────────────────────────────
// Must be declared before any import that transitively loads @workspace/db.

// Mutable "database" that individual tests can override.
let mockTokenRow: Record<string, unknown> | null = null;
let mockListRow: Record<string, unknown> | null = null;
let mockListItems: Array<{ resource: { title: string; url: string } }> = [];
// Track last db.update call args for assertion
let lastUpdateSet: Record<string, unknown> | null = null;
let tokenDeleted = false;
// Account row returned by the live authentication lookup.
let mockUserRole: "student" | "teacher" = "teacher";
let mockEducatorEnabled = true;
let mockAuthenticatedUserId = 42;

// Minimal chainable Drizzle mock.
// Chain methods return `this`; terminal `.where()` resolves with the
// configured value for that operation.
function makeSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

vi.mock("@workspace/db", () => {
  // Stub table objects, used only as identifiers passed to the mock db.
  const stub = (name: string) => ({ _name: name });

  const db = {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  };

  return {
    db,
    googleTokensTable: stub("google_tokens"),
    resourceListsTable: stub("resource_lists"),
    listItemsTable: stub("list_items"),
    resourcesTable: stub("resources"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
    usersTable: stub("users"),
  };
});

// ── Import subjects AFTER mock declarations ───────────────────────────────────
import { db } from "@workspace/db";
import gcRouter from "./googleClassroom.js";
import { issueToken } from "../lib/auth.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET!; // set in test/setup.ts

/** Build a minimal Express app wrapping the GC router at /api */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", gcRouter);
  return app;
}

/** Issue a valid teacher token for user `id` */
function teacherToken(id: number) {
  mockAuthenticatedUserId = id;
  return `Bearer ${issueToken(id, "teacher")}`;
}

/** Create a valid OAuth state for `userId` (same algorithm as the route) */
function makeState(userId: number, tsOverride?: number): string {
  const ts = (tsOverride ?? Date.now()).toString();
  const payload = `${userId}:${ts}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

// ── Wire up db mock behaviour before each test ─────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockTokenRow = null;
  mockListRow = null;
  mockListItems = [];
  lastUpdateSet = null;
  tokenDeleted = false;
  mockUserRole = "teacher";
  mockEducatorEnabled = true;
  mockAuthenticatedUserId = 42;

  // Default select: return empty arrays
  vi.mocked(db.select).mockImplementation(() => {
    // Each call to db.select returns a fresh chainable.
    // We inspect which table is queried via the from() argument name.
    let tableName = "";
    const chain = {
      from: vi.fn().mockImplementation((table: { _name: string }) => {
        tableName = table._name;
        return chain;
      }),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        if (tableName === "google_tokens") {
          return Promise.resolve(mockTokenRow ? [mockTokenRow] : []);
        }
        if (tableName === "resource_lists") {
          return Promise.resolve(mockListRow ? [mockListRow] : []);
        }
        if (tableName === "list_items") {
          return Promise.resolve(mockListItems);
        }
        if (tableName === "users") {
          // requireAuth reads durable capability from the live account row.
          return Promise.resolve([{
            id: mockAuthenticatedUserId,
            role: mockUserRole,
            activeRole: mockUserRole,
            educatorEnabled: mockEducatorEnabled,
            bannedAt: null,
          }]);
        }
        return Promise.resolve([]);
      }),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });

  // update chain
  vi.mocked(db.update).mockImplementation(() => {
    const chain = {
      set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        lastUpdateSet = values;
        return chain;
      }),
      where: vi.fn().mockResolvedValue(undefined),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });

  // delete chain
  vi.mocked(db.delete).mockImplementation(() => {
    const chain = {
      where: vi.fn().mockImplementation(() => {
        tokenDeleted = true;
        return Promise.resolve(undefined);
      }),
    };
    return chain as unknown as ReturnType<typeof db.delete>;
  });

  // insert chain (used in callback & import-course; not central to these tests)
  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/google-classroom/courses
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/google-classroom/courses", () => {
  it("keeps access when an educator is using the learner workspace", async () => {
    mockUserRole = "student";
    mockEducatorEnabled = true;
    mockTokenRow = {
      id: 1,
      userId: 42,
      accessToken: "valid-access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ courses: [] }),
      }),
    );

    const res = await request(buildApp())
      .get("/api/google-classroom/courses")
      .set("Authorization", teacherToken(42));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns course list when the stored access token is still valid", async () => {
    // Token expires 1 hour from now, no refresh needed.
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockTokenRow = {
      id: 1,
      userId: 42,
      accessToken: "valid-access-token",
      refreshToken: "refresh-token",
      expiresAt,
    };

    // Stub the Google Classroom API response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          courses: [
            { id: "course-1", name: "Math 101", section: "Period 1" },
            { id: "course-2", name: "Science 202", section: undefined },
          ],
        }),
      }),
    );

    const res = await request(buildApp())
      .get("/api/google-classroom/courses")
      .set("Authorization", teacherToken(42));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "course-1", name: "Math 101", section: "Period 1" },
      { id: "course-2", name: "Science 202", section: null },
    ]);

    // Fetch was called exactly once, no refresh call
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain("classroom.googleapis.com");
  });

  it("transparently refreshes an expired access token and retries with the new token", async () => {
    // Token expired 10 minutes ago
    const expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockTokenRow = {
      id: 1,
      userId: 42,
      accessToken: "expired-access-token",
      refreshToken: "refresh-token-xyz",
      expiresAt,
    };

    const fetchMock = vi
      .fn()
      // First call: token refresh endpoint → success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "fresh-access-token", expires_in: 3600 }),
      })
      // Second call: courses list with the refreshed token
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          courses: [{ id: "c1", name: "History", section: "AM" }],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const res = await request(buildApp())
      .get("/api/google-classroom/courses")
      .set("Authorization", teacherToken(42));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "c1", name: "History", section: "AM" }]);

    // Two fetch calls: one refresh, one courses list
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [refreshUrl] = fetchMock.mock.calls[0] as [string, ...unknown[]];
    expect(refreshUrl).toBe("https://oauth2.googleapis.com/token");

    // The courses call must use the NEW token, not the expired one
    const [, coursesInit] = fetchMock.mock.calls[1] as [
      string,
      { headers: { Authorization: string } },
    ];
    expect(coursesInit.headers.Authorization).toBe("Bearer fresh-access-token");

    // DB should have been updated with the new token
    expect(lastUpdateSet).toMatchObject({ accessToken: "fresh-access-token" });
  });

  it("returns 401 and removes the stored token when the refresh token has been revoked", async () => {
    // Token expired, and refresh fails (revoked)
    const expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockTokenRow = {
      id: 1,
      userId: 42,
      accessToken: "expired-access-token",
      refreshToken: "revoked-refresh-token",
      expiresAt,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant" }),
      }),
    );

    const res = await request(buildApp())
      .get("/api/google-classroom/courses")
      .set("Authorization", teacherToken(42));

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/reconnect/i);

    // Token row must be deleted from the DB
    expect(tokenDeleted).toBe(true);
  });

  it("returns 401 when there is no stored token at all", async () => {
    mockTokenRow = null; // no row in DB

    const res = await request(buildApp())
      .get("/api/google-classroom/courses")
      .set("Authorization", teacherToken(42));

    expect(res.status).toBe(401);
  });

  it("returns 401 when the token row has no refresh_token and the access token is expired", async () => {
    const expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockTokenRow = {
      id: 1,
      userId: 42,
      accessToken: "expired-access-token",
      refreshToken: null, // no refresh token stored
      expiresAt,
    };

    vi.stubGlobal("fetch", vi.fn()); // should never be called

    const res = await request(buildApp())
      .get("/api/google-classroom/courses")
      .set("Authorization", teacherToken(42));

    expect(res.status).toBe(401);
    // DB row must be cleaned up
    expect(tokenDeleted).toBe(true);
    // No fetch calls to Google
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller has not enabled educator tools", async () => {
    mockUserRole = "student";
    mockEducatorEnabled = false;
    const studentToken = `Bearer ${issueToken(7, "student")}`;
    const res = await request(buildApp())
      .get("/api/google-classroom/courses")
      .set("Authorization", studentToken);

    expect(res.status).toBe(403);
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(buildApp()).get("/api/google-classroom/courses");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/google-classroom/share
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/google-classroom/share", () => {
  const TEACHER_ID = 10;
  const LIST_ID = 5;
  const COURSE_ID = "gc-course-abc";

  beforeEach(() => {
    // Valid, non-expired token for the teacher
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockTokenRow = {
      id: 1,
      userId: TEACHER_ID,
      accessToken: "valid-teacher-token",
      refreshToken: "rt",
      expiresAt,
    };

    // The list belongs to this teacher
    mockListRow = {
      id: LIST_ID,
      name: "Week 3 Reading",
      description: "Essential readings",
      ownerId: TEACHER_ID,
    };

    // One resource in the list
    mockListItems = [
      { resource: { title: "Khan Academy: Algebra", url: "https://khanacademy.org/algebra" } },
    ];
  });

  it("posts an announcement to Google Classroom and returns announcementId + url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // Teacher membership check
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        // Announcement POST
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "announcement-999",
            alternateLink: "https://classroom.google.com/c/abc/p/999",
          }),
        }),
    );

    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ listId: LIST_ID, courseId: COURSE_ID });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      announcementId: "announcement-999",
      url: "https://classroom.google.com/c/abc/p/999",
    });

    // The announcement body should contain the list name and resource URL
    const [, announcementInit] = vi.mocked(fetch).mock.calls[1] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    const announcementBody = JSON.parse(announcementInit.body) as { text: string };
    expect(announcementBody.text).toContain("Week 3 Reading");
    expect(announcementBody.text).toContain("https://khanacademy.org/algebra");
  });

  it("refreshes an expired token and uses the new token for membership check and announcement", async () => {
    // Token expired 10 minutes ago, share must trigger refresh first
    const expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockTokenRow = {
      id: 1,
      userId: TEACHER_ID,
      accessToken: "expired-teacher-token",
      refreshToken: "teacher-refresh-token",
      expiresAt,
    };

    const fetchMock = vi
      .fn()
      // 1. Token refresh
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "refreshed-teacher-token", expires_in: 3600 }),
      })
      // 2. Teacher membership check (uses refreshed token)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      // 3. Announcement POST (uses refreshed token)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "ann-refreshed",
          alternateLink: "https://classroom.google.com/c/abc/p/refreshed",
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ listId: LIST_ID, courseId: COURSE_ID });

    expect(res.status).toBe(200);
    expect(res.body.announcementId).toBe("ann-refreshed");

    // Three fetch calls: refresh, membership, announcement
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [refreshUrl] = fetchMock.mock.calls[0] as [string, ...unknown[]];
    expect(refreshUrl).toBe("https://oauth2.googleapis.com/token");

    // Both Classroom calls must carry the REFRESHED token, not the expired one
    const [, membershipInit] = fetchMock.mock.calls[1] as [
      string,
      { headers: { Authorization: string } },
    ];
    expect(membershipInit.headers.Authorization).toBe("Bearer refreshed-teacher-token");

    const [, announcementInit] = fetchMock.mock.calls[2] as [
      string,
      { headers: { Authorization: string } },
    ];
    expect(announcementInit.headers.Authorization).toBe("Bearer refreshed-teacher-token");

    // DB must be updated with the refreshed token
    expect(lastUpdateSet).toMatchObject({ accessToken: "refreshed-teacher-token" });
  });

  it("returns 401 when the share token is revoked (refresh fails)", async () => {
    const expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockTokenRow = {
      id: 1,
      userId: TEACHER_ID,
      accessToken: "expired-teacher-token",
      refreshToken: "revoked-refresh-token",
      expiresAt,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false, status: 400 }),
    );

    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ listId: LIST_ID, courseId: COURSE_ID });

    expect(res.status).toBe(401);
    expect(tokenDeleted).toBe(true);
  });

  it("returns 403 when the authenticated Google account is not a teacher of the course", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // Teacher membership check returns 404 → not a teacher
        .mockResolvedValueOnce({ ok: false, status: 404 }),
    );

    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ listId: LIST_ID, courseId: COURSE_ID });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not a teacher/i);
  });

  it("returns 403 when trying to share a list that belongs to another teacher", async () => {
    mockListRow = { id: LIST_ID, name: "Stolen List", ownerId: 999 /* different owner */ };

    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ listId: LIST_ID, courseId: COURSE_ID });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
  });

  it("returns 404 when the list does not exist", async () => {
    mockListRow = null;

    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ listId: LIST_ID, courseId: COURSE_ID });

    expect(res.status).toBe(404);
  });

  it("returns 401 when Google token is missing", async () => {
    mockTokenRow = null;

    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ listId: LIST_ID, courseId: COURSE_ID });

    expect(res.status).toBe(401);
  });

  it("returns 400 for a missing listId", async () => {
    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ courseId: COURSE_ID }); // no listId

    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing courseId", async () => {
    const res = await request(buildApp())
      .post("/api/google-classroom/share")
      .set("Authorization", teacherToken(TEACHER_ID))
      .send({ listId: LIST_ID }); // no courseId

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// OAuth state HMAC verification  (tested via GET /api/auth/google/callback)
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/auth/google/callback, OAuth state verification", () => {
  it("rejects a state that was tampered with (HMAC mismatch)", async () => {
    // Flip the last character of a valid state to break the HMAC
    const valid = makeState(42);
    const tampered = valid.slice(0, -1) + (valid.endsWith("a") ? "b" : "a");

    const res = await request(buildApp()).get(
      `/api/auth/google/callback?code=authcode&state=${tampered}`,
    );

    // Should redirect to the frontend with gc_error=invalid_state
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("gc_error=invalid_state");
  });

  it("rejects a state that is older than 15 minutes (replay protection)", async () => {
    // Timestamp 16 minutes in the past
    const sixteenMinutesAgo = Date.now() - 16 * 60 * 1000;
    const expiredState = makeState(42, sixteenMinutesAgo);

    const res = await request(buildApp()).get(
      `/api/auth/google/callback?code=authcode&state=${expiredState}`,
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("gc_error=invalid_state");
  });

  it("accepts a freshly-issued valid state and proceeds to token exchange", async () => {
    const state = makeState(42);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
        }),
      }),
    );

    const res = await request(buildApp()).get(
      `/api/auth/google/callback?code=valid-code&state=${state}`,
    );

    // Should redirect to the success URL
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("gc_connected=1");
    expect(res.headers.location).not.toContain("gc_error");
  });

  it("redirects with gc_error when Google returns an error param", async () => {
    const res = await request(buildApp()).get(
      "/api/auth/google/callback?error=access_denied",
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("gc_error=access_denied");
  });

  it("redirects with gc_error=missing_params when code or state is absent", async () => {
    const res = await request(buildApp()).get("/api/auth/google/callback?code=only-code");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("gc_error=missing_params");
  });
});
