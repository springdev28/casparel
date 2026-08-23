/**
 * @fileOverview Verification role: exercises Classes.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Tests for durable educator capability and contextual class authorization.
 *
 * Key contract: `isClassTeacher` checks live educator capability plus class
 * ownership or teacher membership. The selected learner/educator workspace is
 * presentation state and does not grant or remove authorization.
 *
 * Covered routes:
 *  • PATCH  /api/classes/:id              , teacher-only update
 *  • DELETE /api/classes/:id              , teacher-only delete
 *  • POST   /api/classes/:id/invitations  , teacher-only, consented invite
 *  • DELETE /api/classes/:id/members/:uid , teacher-only removal
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── DB mock ────────────────────────────────────────────────────────────────────
// Must be declared before any import that transitively loads @workspace/db.

/** Role the users-table mock returns for the acting user */
let mockActorRole: "student" | "teacher" = "teacher";
let mockActorEducatorEnabled = true;
let mockRequestEducatorEnabled = true;
let mockRequestAccountRole: "student" | "teacher" | "admin" = "teacher";

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  const db = {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  };
  return {
    db,
    usersTable: stub("users"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
    classInvitationsTable: stub("class_invitations"),
    resourceListsTable: stub("resource_lists"),
    listItemsTable: stub("list_items"),
    scheduleBlocksTable: stub("schedule_blocks"),
    resourcesTable: stub("resources"),
    reviewsTable: stub("reviews"),
    googleTokensTable: stub("google_tokens"),
    activityLogTable: stub("activity_log"),
    classResourceRecommendationsTable: stub("class_recommendations"),
  };
});

// Authentication has its own middleware tests. Keep these route tests focused on
// the live capability and class-context checks performed by isClassTeacher.
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: { userId?: number; userRole?: string; accountRole?: string; educatorEnabled?: boolean }, _res: unknown, next: () => void) => {
    req.userId = 10;
    req.userRole = "teacher";
    req.accountRole = mockRequestAccountRole;
    req.educatorEnabled = mockRequestEducatorEnabled;
    next();
  },
}));

vi.mock("../lib/entitlements", () => ({
  getAccountEntitlements: vi.fn().mockResolvedValue({
    tier: "pro",
    label: "Pro",
    unlimitedAi: true,
    features: {
      "ai-discovery": true,
      "deep-research": true,
      "seating-planner": true,
    },
  }),
}));

// ── Import subjects AFTER mock declarations ────────────────────────────────────
import { db } from "@workspace/db";
import classesRouter from "./classes.js";
import { issueToken } from "../lib/auth.js";
import { isClassTeacher } from "../lib/authz.js";
import { getAccountEntitlements } from "../lib/entitlements";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const CLASS_ID = 1;
const TEACHER_ID = 10;
const MEMBER_ID = 99;

const CLASS_ROW = { id: CLASS_ID, teacherId: TEACHER_ID, name: "Test Class", description: null, subject: "Math", gradeLevel: "Grade 5", createdAt: new Date().toISOString() };
const MEMBER_ROW = { id: 5, userId: MEMBER_ID, classId: CLASS_ID, role: "student", joinedAt: new Date().toISOString() };
const INVITED_USER_ROW = { id: MEMBER_ID, email: "member@example.com", name: "Member", role: "student", createdAt: new Date().toISOString() };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", classesRouter);
  return app;
}

/** Issue a JWT regardless of the role string, simulates a token from a prior session */
function tokenFor(role: "teacher" | "student", id = TEACHER_ID) {
  return `Bearer ${issueToken(id, role)}`;
}

// ── Wire DB mock behaviour ─────────────────────────────────────────────────────

/**
 * Build a select-chain mock.  `tableName` is captured when `.from()` is called;
 * `.where()` resolves with the appropriate stub based on the table name and the
 * current `mockActorRole`.
 */
function makeSelectChain() {
  let tableName = "";
  const chain: Record<string, unknown> = {
    from: vi.fn().mockImplementation((table: { _name: string }) => {
      tableName = table._name;
      return chain;
    }),
    where: vi.fn().mockImplementation(() => {
      switch (tableName) {
        case "users":
          // isClassTeacher capability lookup OR member lookup by email (same table)
          return Promise.resolve([
            tableName === "users" && mockActorRole === "teacher"
              ? { id: TEACHER_ID, role: "teacher", educatorEnabled: mockActorEducatorEnabled, email: "teacher@example.com", name: "Teacher", createdAt: new Date().toISOString() }
              : { id: TEACHER_ID, role: "student", educatorEnabled: mockActorEducatorEnabled, email: "teacher@example.com", name: "Teacher", createdAt: new Date().toISOString() },
          ]);
        case "classes":
          return Promise.resolve([CLASS_ROW]);
        case "class_members":
          return Promise.resolve([MEMBER_ROW]);
        default:
          return Promise.resolve([]);
      }
    }),
    innerJoin: vi.fn().mockReturnThis(),
    // count sub-select used by classWithCount
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  };
  return chain;
}

/**
 * Overridden select chain for POST /members: the third select must return the
 * *invited* user row (looked up by email), not the actor's user row.
 */
function makeSelectChainForMemberInvite() {
  let callCount = 0;
  return function () {
    const callIdx = callCount++;
    let tableName = "";
    const chain: Record<string, unknown> = {
      from: vi.fn().mockImplementation((table: { _name: string }) => {
        tableName = table._name;
        return chain;
      }),
      where: vi.fn().mockImplementation(() => {
        if (tableName === "users") {
          // Call 0: isClassTeacher capability check (actor's own row)
          // Call 2: member lookup by email
          if (callIdx === 0) {
            return Promise.resolve([{ id: TEACHER_ID, role: mockActorRole, educatorEnabled: mockActorEducatorEnabled }]);
          }
          // Email-based lookup → invited user
          return Promise.resolve([INVITED_USER_ROW]);
        }
        if (tableName === "classes") {
          return Promise.resolve([CLASS_ROW]);
        }
        if (tableName === "class_members") {
          return Promise.resolve([MEMBER_ROW]);
        }
        return Promise.resolve([]);
      }),
      innerJoin: vi.fn().mockReturnThis(),
    };
    return chain;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockActorRole = "teacher";
  mockActorEducatorEnabled = true;
  mockRequestEducatorEnabled = true;
  mockRequestAccountRole = "teacher";

  vi.mocked(db.select).mockImplementation(makeSelectChain as unknown as () => ReturnType<typeof db.select>);
  vi.mocked(db.transaction).mockImplementation(async (callback) =>
    callback(db as unknown as Parameters<typeof callback>[0]),
  );

  // update chain: .set().where().returning() → returns updated class row
  vi.mocked(db.update).mockImplementation(() => {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([CLASS_ROW]),
    };
    return chain as unknown as ReturnType<typeof db.update>;
  });

  // delete chain: .where() → resolves void
  vi.mocked(db.delete).mockImplementation(() => {
    const chain = {
      where: vi.fn().mockResolvedValue(undefined),
    };
    return chain as unknown as ReturnType<typeof db.delete>;
  });

  // insert chain: .values().onConflictDoNothing() → resolves void
  vi.mocked(db.insert).mockImplementation(() => {
    const chain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([CLASS_ROW]),
    };
    return chain as unknown as ReturnType<typeof db.insert>;
  });
});

describe("POST /api/classes, educator capability", () => {
  it("rejects an account that has not enabled educator tools", async () => {
    mockRequestEducatorEnabled = false;
    mockRequestAccountRole = "student";

    const res = await request(buildApp())
      .post("/api/classes")
      .set("Authorization", tokenFor("student"))
      .send({ name: "Math", subject: "Math", gradeLevel: "Grade 5" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/educator capability/i);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/classes/:id
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/classes/:id, teacher-only", () => {
  it("returns 200 when caller's current DB role is teacher and they own the class", async () => {
    // After the update, classWithCount does two more selects (classes + class_members).
    // Wire them separately so they don't collide with isClassTeacher's selects.
    vi.mocked(db.select)
      .mockImplementationOnce(() => {
        // isClassTeacher: usersTable capability check
        const chain = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "teacher", educatorEnabled: true }]),
        };
        return chain as unknown as ReturnType<typeof db.select>;
      })
      .mockImplementationOnce(() => {
        // isClassTeacher: classesTable ownership check
        const chain = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([CLASS_ROW]),
        };
        return chain as unknown as ReturnType<typeof db.select>;
      })
      .mockImplementationOnce(() => {
        // classWithCount: classesTable fetch
        const chain = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([CLASS_ROW]),
        };
        return chain as unknown as ReturnType<typeof db.select>;
      })
      .mockImplementationOnce(() => {
        // classWithCount: classMembersTable count
        const chain = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        };
        return chain as unknown as ReturnType<typeof db.select>;
      });

    const res = await request(buildApp())
      .patch(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("teacher"))
      .send({ name: "Updated Class" });

    expect(res.status).toBe(200);
  });

  it("returns 403 when educator capability is disabled (fresh student token)", async () => {
    mockActorRole = "student";

    // Only the capability check fires; the route short-circuits before any write.
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student", educatorEnabled: false }]),
      };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .patch(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("student"))
      .send({ name: "Attempt update" });

    expect(res.status).toBe(403);
  });

  it("returns 403 with a stale teacher token when educator capability is disabled", async () => {
    mockActorRole = "student";

    // Stale token: structurally valid teacher JWT, but DB says student.
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student", educatorEnabled: false }]),
      };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .patch(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("teacher"))   // stale teacher JWT
      .send({ name: "Stale-token attempt" });

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/classes/:id
// ══════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/classes/:id, teacher-only", () => {
  it("returns 204 when caller is teacher and owns the class", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(() => {
        const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "teacher", educatorEnabled: true }]) };
        return chain as unknown as ReturnType<typeof db.select>;
      })
      .mockImplementationOnce(() => {
        const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([CLASS_ROW]) };
        return chain as unknown as ReturnType<typeof db.select>;
      });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("teacher"));

    expect(res.status).toBe(204);
  });

  it("returns 403 when educator capability is disabled (fresh student token)", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student", educatorEnabled: false }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("student"));

    expect(res.status).toBe(403);
  });

  it("returns 403 with a stale teacher token when educator capability is disabled", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student", educatorEnabled: false }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("teacher"));   // stale teacher JWT

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/classes/:id/members
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/classes/:id/members is gone, invites need consent", () => {
  it("no longer exists: a member cannot be added without their consent", async () => {
    // The route looked up any account by email and inserted a class membership
    // outright. Membership is not cosmetic - the default profile and library
    // visibility is "classmates" - and any account can act as a teacher, so a
    // stranger could pull arbitrary users into a class and see their content.
    // POST /classes/:id/invitations replaces it with a pending invitation the
    // invitee must accept. If someone reinstates the force-add, this fails.
    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/members`)
      .set("Authorization", tokenFor("teacher"))
      .send({ email: "victim@example.com", role: "student" });

    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/classes/:id/invitations
// ══════════════════════════════════════════════════════════════════════════════

// These two guard isClassTeacher rather than any one route: the check must read
// the live database role, not the role baked into the token. They used to run
// against the force-add route; the invitation route carries the same guard.
describe("POST /api/classes/:id/invitations, teacher-only", () => {
  it("returns 403 when educator capability is disabled (fresh student token)", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student", educatorEnabled: false }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/invitations`)
      .set("Authorization", tokenFor("student"))
      .send({ email: "member@example.com" });

    expect(res.status).toBe(403);
  });

  it("returns 403 with a stale teacher token when educator capability is disabled", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student", educatorEnabled: false }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/invitations`)
      .set("Authorization", tokenFor("teacher"))   // stale teacher JWT
      .send({ email: "member@example.com" });

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/classes/:id/members/:userId
// ══════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/classes/:id/members/:userId, teacher-only", () => {
  it("returns 204 when caller is teacher and owns the class", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(() => {
        const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "teacher", educatorEnabled: true }]) };
        return chain as unknown as ReturnType<typeof db.select>;
      })
      .mockImplementationOnce(() => {
        const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([CLASS_ROW]) };
        return chain as unknown as ReturnType<typeof db.select>;
      });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}/members/${MEMBER_ID}`)
      .set("Authorization", tokenFor("teacher"));

    expect(res.status).toBe(204);
  });

  it("returns 403 when educator capability is disabled (fresh student token)", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student", educatorEnabled: false }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}/members/${MEMBER_ID}`)
      .set("Authorization", tokenFor("student"));

    expect(res.status).toBe(403);
  });

  it("returns 403 with a stale teacher token when educator capability is disabled", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student", educatorEnabled: false }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}/members/${MEMBER_ID}`)
      .set("Authorization", tokenFor("teacher"));   // stale teacher JWT

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Workspace switching is presentation state, not authorization truth.
// ══════════════════════════════════════════════════════════════════════════════

describe("isClassTeacher durable educator capability", () => {
  it("keeps owner authorization while the educator uses the learner workspace", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          id: TEACHER_ID,
          role: "teacher",
          activeRole: "student",
          educatorEnabled: true,
        }]),
      }) as unknown as ReturnType<typeof db.select>)
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([CLASS_ROW]),
      }) as unknown as ReturnType<typeof db.select>);

    await expect(isClassTeacher(CLASS_ID, TEACHER_ID)).resolves.toBe(true);
  });

  it("allows an educator who is a contextual teacher member", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          id: TEACHER_ID,
          role: "student",
          activeRole: "student",
          educatorEnabled: true,
        }]),
      }) as unknown as ReturnType<typeof db.select>)
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ ...CLASS_ROW, teacherId: 77 }]),
      }) as unknown as ReturnType<typeof db.select>)
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ role: "teacher" }]),
      }) as unknown as ReturnType<typeof db.select>);

    await expect(isClassTeacher(CLASS_ID, TEACHER_ID)).resolves.toBe(true);
  });
});

describe("isClassTeacher administrator workspace switching", () => {
  it("keeps administrator management access while previewing the teacher workspace", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { id: TEACHER_ID, role: "admin", activeRole: "teacher", educatorEnabled: false },
      ]),
    };
    vi.mocked(db.select).mockImplementationOnce(
      () => chain as unknown as ReturnType<typeof db.select>,
    );

    await expect(isClassTeacher(CLASS_ID, TEACHER_ID)).resolves.toBe(true);
    expect(chain.from).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/classes/:id/seating-plan/suggest, subscription gate", () => {
  it("rejects a Free teacher before generating a seating assignment", async () => {
    vi.mocked(getAccountEntitlements).mockResolvedValueOnce({
      tier: "free",
      label: "Free",
      unlimitedAi: false,
      features: {
        "ai-discovery": false,
        "deep-research": false,
        "seating-planner": false,
      },
    });

    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/seating-plan/suggest`)
      .set("Authorization", tokenFor("teacher"))
      .send({ priorities: null });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: "SUBSCRIPTION_REQUIRED",
      requiredPlan: "pro",
    });
  });
});
