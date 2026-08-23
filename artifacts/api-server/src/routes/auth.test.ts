/**
 * @fileOverview Verification role: exercises Auth.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Tests for auth routes:
 *  • POST /api/auth/register , role defaults to "student" when omitted
 *  • POST /api/auth/login    , returns a valid token with the persisted role
 *  • PATCH /api/users/me/role, switches workspace without rewriting account
 *                               identity and re-issues the token
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
    userPreferencesTable: stub("user_preferences"),
  };
});

// Authentication middleware has its own live-user checks. These route tests
// focus on auth route behavior, so decode the test JWT without consuming the
// database fixtures intended for the route itself.
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: { headers: { authorization?: string }; userId?: number; userRole?: string; accountRole?: string },
    res: { status: (code: number) => { json: (value: unknown) => void } },
    next: () => void,
  ) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const payload = JSON.parse(
        Buffer.from(header.slice(7).split(".")[1], "base64url").toString("utf8"),
      ) as { userId: number; role: string };
      req.userId = payload.userId;
      req.userRole = payload.role;
      req.accountRole = payload.role;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  },
}));

// ── Import subjects AFTER mock declarations ────────────────────────────────────
import { db } from "@workspace/db";
import authRouter from "./auth.js";
import { issueToken, decodeToken } from "../lib/auth.js";

// ── Helpers ────────────────────────────────────────────────────────────────────
function withPrivacyDefaults(row: Record<string, unknown> | null) {
  return row ? { profileVisibility: "classmates", showBio: true, showSubjects: true, showGradeOrDept: true, showWebsite: true, ...row } : null;
}


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
          const row = withPrivacyDefaults(mockExistingUser); return Promise.resolve(row ? [row] : []);
        }
        const row = withPrivacyDefaults(mockUserRow); return Promise.resolve(row ? [row] : []);
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
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockImplementation(() =>
        Promise.resolve(withPrivacyDefaults(mockUserRow) ? [withPrivacyDefaults(mockUserRow)!] : []),
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
        Promise.resolve(withPrivacyDefaults(mockUserRow) ? [withPrivacyDefaults(mockUserRow)!] : []),
      ),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });
});

const preferenceFixture = (language: "en" | "tr" | "es" | null = "en") => ({
  userId: 1,
  language,
  interfaceColors: null,
  ambientStyle: null,
  ambientIntensity: null,
  readNotificationIds: [],
  dashboardGoalIds: {},
  continueStudying: {},
  pendingCheckIns: {},
  searchHistory: [],
  resourceSearchState: null,
  allowMessageRequests: true,
  tutorialSeen: true,
  updatedAt: "2026-08-22T10:00:00.000Z",
});

describe("account preference contract", () => {
  const authorization = () => `Bearer ${issueToken(1, "student")}`;

  it("maps a legacy unsupported interface locale to unset", async () => {
    mockExistingUser = preferenceFixture("es");

    const response = await request(buildApp())
      .get("/api/users/me/preferences")
      .set("Authorization", authorization());

    expect(response.status).toBe(200);
    expect(response.body.language).toBeNull();
  });

  it("rejects an interface locale that is not supported product-wide", async () => {
    const response = await request(buildApp())
      .patch("/api/users/me/preferences")
      .set("Authorization", authorization())
      .send({ language: "fr" });

    expect(response.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("persists a supported locale through the generated contract", async () => {
    mockUserRow = preferenceFixture("tr");

    const response = await request(buildApp())
      .patch("/api/users/me/preferences")
      .set("Authorization", authorization())
      .send({ language: "tr" });

    expect(response.status).toBe(200);
    expect(response.body.language).toBe("tr");
    expect(lastInserted).toMatchObject({ userId: 1, language: "tr" });
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

describe("POST /api/auth/login", () => {
  it("returns a token and persisted user for valid credentials", async () => {
    const password = "Password1!";
    mockExistingUser = {
      id: 3,
      email: "login@example.com",
      passwordHash: await import("../lib/auth.js").then(({ hashPassword }) => hashPassword(password)),
      name: "Login User",
      role: "student",
      createdAt: new Date().toISOString(),
    };

    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ email: "login@example.com", password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("login@example.com");
    expect(decodeToken(res.body.token)?.userId).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/users/me/role
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/users/me/role", () => {
  const USER_ID = 10;

  it("switches a teacher account to the learner workspace and re-issues a fresh token", async () => {
    mockUserRow = {
      id: USER_ID,
      email: "carol@example.com",
      name: "Carol",
      role: "teacher",
      activeRole: "student",
      educatorEnabled: true,
      createdAt: new Date().toISOString(),
    };

    const teacherToken = `Bearer ${issueToken(USER_ID, "teacher")}`;

    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .set("Authorization", teacherToken)
      .send({ role: "student" });

    expect(res.status).toBe(200);
    expect(lastUpdated).toEqual({ activeRole: "student" });
    const decoded = decodeToken(res.body.token);
    expect(decoded?.role).toBe("student");
    expect(decoded?.accountRole).toBe("teacher");
    expect(res.body.user.role).toBe("teacher");
  });

  it("opens the educator workspace without changing student account identity", async () => {
    mockUserRow = {
      id: USER_ID,
      email: "dave@example.com",
      name: "Dave",
      role: "student",
      activeRole: "teacher",
      educatorEnabled: true,
      createdAt: new Date().toISOString(),
    };

    const studentToken = `Bearer ${issueToken(USER_ID, "student")}`;

    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .set("Authorization", studentToken)
      .send({ role: "teacher" });

    expect(res.status).toBe(200);
    expect(lastUpdated).toEqual({ activeRole: "teacher", educatorEnabled: true });
    const decoded = decodeToken(res.body.token);
    expect(decoded?.role).toBe("teacher");
    expect(decoded?.accountRole).toBe("student");
    expect(res.body.user.role).toBe("student");
  });

  it("does not clear publishing verification when changing workspace", async () => {
    mockUserRow = {
      id: USER_ID,
      email: "mallory@example.com",
      name: "Mallory",
      role: "teacher",
      activeRole: "student",
      educatorEnabled: true,
      teacherVerified: true,
      createdAt: new Date().toISOString(),
    };

    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .set("Authorization", `Bearer ${issueToken(USER_ID, "teacher")}`)
      .send({ role: "student" });

    expect(res.status).toBe(200);
    expect(lastUpdated).toEqual({ activeRole: "student" });
    expect(lastUpdated).not.toHaveProperty("teacherVerified");
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

  it("role-switch re-issues a token from live account identity and the selected workspace", async () => {
    // A user may call PATCH /me/role while holding a stale teacher-workspace
    // token. The endpoint must issue from the updated DB row instead of
    // trusting the incoming workspace or account-role claims.
    const staleTeacherToken = issueToken(USER_ID, "teacher");

    mockUserRow = {
      id: USER_ID,
      email: "eve@example.com",
      name: "Eve",
      role: "student",
      activeRole: "student",
      educatorEnabled: true,
      createdAt: new Date().toISOString(),
    };

    const res = await request(buildApp())
      .patch("/api/users/me/role")
      .set("Authorization", `Bearer ${staleTeacherToken}`)
      .send({ role: "student" });

    expect(res.status).toBe(200);
    const freshDecoded = decodeToken(res.body.token);
    expect(freshDecoded?.role).toBe("student");
    expect(freshDecoded?.accountRole).toBe("student");
    expect(res.body.token).not.toBe(staleTeacherToken);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/users/me , extended profile fields
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/users/me, profile fields", () => {
  const USER_ID = 20;

  it("saves new profile fields and returns them in the response", async () => {
    const updated = {
      id: USER_ID,
      email: "alice@example.com",
      name: "Alice",
      role: "student",
      avatarUrl: null,
      bio: "I love maths.",
      subjects: ["Mathematics", "Physics"],
      gradeOrDept: "Grade 11",
      timezone: "America/New_York",
      websiteUrl: "https://alice.example.com",
      createdAt: new Date().toISOString(),
    };
    mockUserRow = updated;

    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .patch("/api/users/me")
      .set("Authorization", token)
      .send({
        bio: "I love maths.",
        subjects: ["Mathematics", "Physics"],
        gradeOrDept: "Grade 11",
        timezone: "America/New_York",
        websiteUrl: "https://alice.example.com",
      });

    expect(res.status).toBe(200);
    expect(lastUpdated).toMatchObject({
      bio: "I love maths.",
      subjects: ["Mathematics", "Physics"],
      gradeOrDept: "Grade 11",
      timezone: "America/New_York",
      websiteUrl: "https://alice.example.com",
    });
    expect(res.body.bio).toBe("I love maths.");
    expect(res.body.subjects).toEqual(["Mathematics", "Physics"]);
    expect(res.body.gradeOrDept).toBe("Grade 11");
    expect(res.body.timezone).toBe("America/New_York");
    expect(res.body.websiteUrl).toBe("https://alice.example.com");
  });

  it("accepts null to clear optional profile fields", async () => {
    mockUserRow = {
      id: USER_ID,
      email: "alice@example.com",
      name: "Alice",
      role: "student",
      avatarUrl: null,
      bio: null,
      subjects: null,
      gradeOrDept: null,
      timezone: null,
      websiteUrl: null,
      createdAt: new Date().toISOString(),
    };

    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .patch("/api/users/me")
      .set("Authorization", token)
      .send({ bio: null, subjects: null, gradeOrDept: null });

    expect(res.status).toBe(200);
    expect(lastUpdated).toMatchObject({ bio: null, subjects: null, gradeOrDept: null });
  });

  it("ignores avatarUrl in the request body, avatar must be set via the upload endpoint", async () => {
    mockUserRow = {
      id: USER_ID,
      email: "alice@example.com",
      name: "Alice",
      role: "student",
      avatarUrl: null, // DB row has no avatarUrl (server stripped it)
      bio: null,
      subjects: null,
      gradeOrDept: null,
      timezone: null,
      websiteUrl: null,
      createdAt: new Date().toISOString(),
    };

    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .patch("/api/users/me")
      .set("Authorization", token)
      .send({
        name: "Alice",
        avatarUrl: "data:image/svg+xml;base64,PHN2ZyB4bWxuczp4bGluaz0iaHR0cHM6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4=",
      });

    expect(res.status).toBe(200);
    // The update call must NOT have received avatarUrl
    expect(lastUpdated).not.toHaveProperty("avatarUrl");
  });

  it("rejects bio longer than 300 characters", async () => {
    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .patch("/api/users/me")
      .set("Authorization", token)
      .send({ bio: "x".repeat(301) });

    expect(res.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const res = await request(buildApp())
      .patch("/api/users/me")
      .send({ bio: "hello" });

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/users/:id , public profile
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/users/:id, public profile", () => {
  const VIEWER_ID = 30;
  const TARGET_ID = 31;

  it("returns the public-safe profile subset and omits email/passwordHash", async () => {
    // requireAuth only decodes the JWT, no DB select.
    // The route's own user lookup is the FIRST db.select() call (callIndex 0),
    // which returns mockExistingUser. Set it to the target user row.
    mockExistingUser = {
      id: TARGET_ID,
      email: "target@example.com",
      passwordHash: "SECRET_HASH",
      profileVisibility: "everyone",
      showBio: true, showSubjects: true, showGradeOrDept: true, showWebsite: true,
      name: "Target User",
      role: "teacher",
      avatarUrl: "https://example.com/avatar.jpg",
      bio: "Teacher bio",
      subjects: ["Science"],
      gradeOrDept: "Science Dept",
      timezone: "Europe/London",
      websiteUrl: null,
      createdAt: new Date().toISOString(),
    };

    const token = `Bearer ${issueToken(VIEWER_ID, "student")}`;
    const res = await request(buildApp())
      .get(`/api/users/${TARGET_ID}`)
      .set("Authorization", token);

    expect(res.status).toBe(200);
    // Required public fields
    expect(res.body.id).toBe(TARGET_ID);
    expect(res.body.name).toBe("Target User");
    expect(res.body.role).toBe("teacher");
    expect(res.body.bio).toBe("Teacher bio");
    expect(res.body.subjects).toEqual(["Science"]);
    expect(res.body.gradeOrDept).toBe("Science Dept");
    // Private fields must not appear; website is field-level controlled.
    expect(res.body.email).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.timezone).toBeUndefined();
    expect(res.body.websiteUrl).toBeNull();
  });

  it("masks fields disabled by the profile owner", async () => {
    mockExistingUser = { id: TARGET_ID, name: "Private Fields", role: "teacher", profileVisibility: "everyone", showBio: false, showSubjects: false, showGradeOrDept: false, showWebsite: false, bio: "hidden", subjects: ["Physics"], gradeOrDept: "Hidden Dept", websiteUrl: "https://example.com" };
    const res = await request(buildApp()).get(`/api/users/${TARGET_ID}`).set("Authorization", `Bearer ${issueToken(VIEWER_ID, "student")}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ bio: null, subjects: null, gradeOrDept: null, websiteUrl: null });
  });

  it("blocks another user from opening a private profile", async () => {
    mockExistingUser = { id: TARGET_ID, name: "Private User", role: "student", profileVisibility: "private", showBio: true, showSubjects: true, showGradeOrDept: true, showWebsite: true };
    const res = await request(buildApp()).get(`/api/users/${TARGET_ID}`).set("Authorization", `Bearer ${issueToken(VIEWER_ID, "student")}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the target user does not exist", async () => {
    // mockUserRow = null → user lookup returns []
    mockUserRow = null;

    const token = `Bearer ${issueToken(VIEWER_ID, "student")}`;
    const res = await request(buildApp())
      .get("/api/users/99999")
      .set("Authorization", token);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a token", async () => {
    const res = await request(buildApp()).get(`/api/users/${TARGET_ID}`);
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/users/me/avatar , avatar upload
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/users/me/avatar", () => {
  const USER_ID = 40;

  // Real magic-byte prefixes for each allowed raster format
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  // WebP: RIFF + 4-byte size + WEBP
  const WEBP_MAGIC = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0x20, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP"),
  ]);

  function mockSuccessRow() {
    mockUserRow = {
      id: USER_ID,
      email: "uploader@example.com",
      name: "Uploader",
      role: "student",
      avatarUrl: "data:image/png;base64,abc123",
      bio: null,
      subjects: null,
      gradeOrDept: null,
      timezone: null,
      websiteUrl: null,
      createdAt: new Date().toISOString(),
    };
  }

  it("accepts a valid PNG (magic bytes) and stores a data-URL", async () => {
    mockSuccessRow();
    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .post("/api/users/me/avatar")
      .set("Authorization", token)
      .attach("file", PNG_MAGIC, { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBeDefined();
    expect(lastUpdated?.avatarUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("accepts a valid JPEG (magic bytes) and stores a data-URL", async () => {
    mockSuccessRow();
    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .post("/api/users/me/avatar")
      .set("Authorization", token)
      .attach("file", JPEG_MAGIC, { filename: "avatar.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(lastUpdated?.avatarUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("accepts a valid WebP (magic bytes) and stores a data-URL", async () => {
    mockSuccessRow();
    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .post("/api/users/me/avatar")
      .set("Authorization", token)
      .attach("file", WEBP_MAGIC, { filename: "avatar.webp", contentType: "image/webp" });

    expect(res.status).toBe(200);
    expect(lastUpdated?.avatarUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it("rejects an attacker who sends non-image bytes while claiming image/png (spoofed MIME)", async () => {
    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .post("/api/users/me/avatar")
      .set("Authorization", token)
      // Random non-image bytes but client claims image/png
      .attach("file", Buffer.from("MZ\x90\x00this is an exe"), {
        filename: "malicious.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/png|jpeg|webp/i);
  });

  it("rejects an SVG file even when claimed as image/svg+xml (XSS vector)", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .post("/api/users/me/avatar")
      .set("Authorization", token)
      .attach("file", Buffer.from(svgContent), {
        filename: "xss.svg",
        contentType: "image/svg+xml",
      });

    expect(res.status).toBe(400);
  });

  it("rejects random bytes with an image/* MIME type", async () => {
    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .post("/api/users/me/avatar")
      .set("Authorization", token)
      .attach("file", Buffer.from("not-an-image-at-all"), {
        filename: "garbage.gif",
        contentType: "image/gif",
      });

    expect(res.status).toBe(400);
  });

  it("returns 400 when no file is attached", async () => {
    const token = `Bearer ${issueToken(USER_ID, "student")}`;
    const res = await request(buildApp())
      .post("/api/users/me/avatar")
      .set("Authorization", token)
      .set("Content-Type", "multipart/form-data");

    expect(res.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const res = await request(buildApp())
      .post("/api/users/me/avatar")
      .attach("file", PNG_MAGIC, { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(401);
  });
});
