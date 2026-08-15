/**
 * Tests for class-mutation authorization after a role downgrade.
 *
 * Key contract: `isClassTeacher` checks the live DB role before checking class
 * ownership.  A user who has switched to Student mode must not be able to
 * modify, delete, or manage members of classes they previously owned as teacher
 *, even when presenting a structurally valid but stale teacher JWT.
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
// the live-role and ownership checks performed by isClassTeacher.
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: { userId?: number; userRole?: string; accountRole?: string }, _res: unknown, next: () => void) => {
    req.userId = 10;
    req.userRole = "teacher";
    req.accountRole = "teacher";
    next();
  },
}));

// Only the account lookup is stubbed. The tier table itself stays real, so a
// change to what a plan includes shows up here instead of being shadowed by a
// hand-written literal that nobody remembers to update.
vi.mock("../lib/entitlements", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/entitlements")>();
  return {
    ...actual,
    getAccountEntitlements: vi
      .fn()
      .mockResolvedValue(actual.entitlementsForPlan("pro", null)),
  };
});

// ── Import subjects AFTER mock declarations ────────────────────────────────────
import { db } from "@workspace/db";
import classesRouter from "./classes.js";
import { issueToken } from "../lib/auth.js";
import { isClassTeacher } from "../lib/authz.js";
import {
  entitlementsForPlan,
  getAccountEntitlements,
} from "../lib/entitlements";

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
          // isClassTeacher live-role lookup OR member lookup by email (same table)
          return Promise.resolve([
            tableName === "users" && mockActorRole === "teacher"
              ? { id: TEACHER_ID, role: "teacher", email: "teacher@example.com", name: "Teacher", createdAt: new Date().toISOString() }
              : { id: TEACHER_ID, role: "student", email: "teacher@example.com", name: "Teacher", createdAt: new Date().toISOString() },
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
          // Call 0: isClassTeacher role check (actor's own row)
          // Call 2: member lookup by email
          if (callIdx === 0) {
            return Promise.resolve([{ id: TEACHER_ID, role: mockActorRole }]);
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

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/classes/:id
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/classes/:id, teacher-only", () => {
  it("returns 200 when caller's current DB role is teacher and they own the class", async () => {
    // After the update, classWithCount does two more selects (classes + class_members).
    // Wire them separately so they don't collide with isClassTeacher's selects.
    vi.mocked(db.select)
      .mockImplementationOnce(() => {
        // isClassTeacher: usersTable role check
        const chain = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "teacher" }]),
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

  it("returns 403 when caller's current DB role is student (fresh student token)", async () => {
    mockActorRole = "student";

    // Only the role check fires; route short-circuits to 403 before any write.
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student" }]),
      };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .patch(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("student"))
      .send({ name: "Attempt update" });

    expect(res.status).toBe(403);
  });

  it("returns 403 when caller presents a stale teacher JWT but DB role is now student", async () => {
    mockActorRole = "student";

    // Stale token: structurally valid teacher JWT, but DB says student.
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student" }]),
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
        const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "teacher" }]) };
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

  it("returns 403 after role downgrade (fresh student token)", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student" }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("student"));

    expect(res.status).toBe(403);
  });

  it("returns 403 when presenting a stale teacher JWT but DB role is now student", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student" }]) };
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
  it("returns 403 after role downgrade (fresh student token)", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student" }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/invitations`)
      .set("Authorization", tokenFor("student"))
      .send({ email: "member@example.com" });

    expect(res.status).toBe(403);
  });

  it("returns 403 when presenting a stale teacher JWT but DB role is now student", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student" }]) };
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
        const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "teacher" }]) };
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

  it("returns 403 after role downgrade (fresh student token)", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student" }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}/members/${MEMBER_ID}`)
      .set("Authorization", tokenFor("student"));

    expect(res.status).toBe(403);
  });

  it("returns 403 when presenting a stale teacher JWT but DB role is now student", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: TEACHER_ID, role: "student" }]) };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}/members/${MEMBER_ID}`)
      .set("Authorization", tokenFor("teacher"));   // stale teacher JWT

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Active-role downgrade regression, teacher account switched to student mode
// isClassTeacher must deny access even when role="teacher" but activeRole="student"
// ══════════════════════════════════════════════════════════════════════════════

describe("isClassTeacher active-role downgrade, role=teacher, activeRole=student", () => {
  /** Returns a users-table stub where the account role is "teacher" but the
   *  active role is "student" (i.e. the user has switched to student mode). */
  function stubbedTeacherInStudentMode() {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { id: TEACHER_ID, role: "teacher", activeRole: "student", email: "teacher@example.com", name: "Teacher", createdAt: new Date().toISOString() },
      ]),
    };
    return chain as unknown as ReturnType<typeof db.select>;
  }

  it("PATCH /classes/:id returns 403 when teacher is in student mode", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => stubbedTeacherInStudentMode());

    const res = await request(buildApp())
      .patch(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("teacher"))
      .send({ name: "Should be blocked" });

    expect(res.status).toBe(403);
  });

  it("DELETE /classes/:id returns 403 when teacher is in student mode", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => stubbedTeacherInStudentMode());

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}`)
      .set("Authorization", tokenFor("teacher"));

    expect(res.status).toBe(403);
  });

  it("POST /classes/:id/invitations returns 403 when teacher is in student mode", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => stubbedTeacherInStudentMode());

    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/invitations`)
      .set("Authorization", tokenFor("teacher"))
      .send({ email: "member@example.com" });

    expect(res.status).toBe(403);
  });

  it("DELETE /classes/:id/members/:userId returns 403 when teacher is in student mode", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => stubbedTeacherInStudentMode());

    const res = await request(buildApp())
      .delete(`/api/classes/${CLASS_ID}/members/${MEMBER_ID}`)
      .set("Authorization", tokenFor("teacher"));

    expect(res.status).toBe(403);
  });
});

describe("isClassTeacher administrator workspace switching", () => {
  it("keeps administrator management access while previewing the teacher workspace", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { id: TEACHER_ID, role: "admin", activeRole: "teacher" },
      ]),
    };
    vi.mocked(db.select).mockImplementationOnce(
      () => chain as unknown as ReturnType<typeof db.select>,
    );

    await expect(isClassTeacher(CLASS_ID, TEACHER_ID)).resolves.toBe(true);
    expect(chain.from).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /api/classes/:id/students/:userId/role, custom class roles", () => {
  beforeEach(() => {
    mockActorRole = "teacher";
    vi.clearAllMocks();
    vi.mocked(db.select).mockImplementation(makeSelectChain as unknown as () => ReturnType<typeof db.select>);
  });

  function mockRoleUpdate(returned: Record<string, unknown> | null) {
    vi.mocked(db.update).mockImplementation(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(returned ? [returned] : []),
    }) as unknown as ReturnType<typeof db.update>);
    // The route reads users twice: the actor's live role first, then the
    // student's public fields for the response. The shared chain returns the
    // teacher row for every users query, which fails response validation.
    let userReads = 0;
    vi.mocked(db.select).mockImplementation((() => {
      let tableName = "";
      const chain: Record<string, unknown> = {
        from: vi.fn().mockImplementation((table: { _name: string }) => { tableName = table._name; return chain; }),
        where: vi.fn().mockImplementation(() => {
          if (tableName === "users") {
            userReads += 1;
            return Promise.resolve(userReads === 1
              ? [{ id: TEACHER_ID, role: mockActorRole }]
              : [{ userId: MEMBER_ID, name: "Member", avatarUrl: null, gradeOrDept: null }]);
          }
          if (tableName === "classes") return Promise.resolve([CLASS_ROW]);
          return Promise.resolve([]);
        }),
        innerJoin: vi.fn().mockReturnThis(),
      };
      return chain;
    }) as unknown as typeof db.select);
  }

  it("lets the teacher assign a role and echoes it back", async () => {
    mockRoleUpdate({ customRole: "Group Leader", seatRow: null, seatColumn: null });
    const res = await request(buildApp())
      .put(`/api/classes/${CLASS_ID}/students/${MEMBER_ID}/role`)
      .set("Authorization", tokenFor("teacher"))
      .send({ role: "Group Leader" });
    expect(res.status).toBe(200);
    expect(res.body.customRole).toBe("Group Leader");
  });

  it("removes the role when null is sent", async () => {
    mockRoleUpdate({ customRole: null, seatRow: null, seatColumn: null });
    const res = await request(buildApp())
      .put(`/api/classes/${CLASS_ID}/students/${MEMBER_ID}/role`)
      .set("Authorization", tokenFor("teacher"))
      .send({ role: null });
    expect(res.status).toBe(200);
    expect(res.body.customRole).toBeNull();
  });

  it("refuses a teacher whose live role has been downgraded", async () => {
    mockActorRole = "student";
    const res = await request(buildApp())
      .put(`/api/classes/${CLASS_ID}/students/${MEMBER_ID}/role`)
      .set("Authorization", tokenFor("teacher"))
      .send({ role: "Group Leader" });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("404s when the target is not a student in this class", async () => {
    mockRoleUpdate(null);
    const res = await request(buildApp())
      .put(`/api/classes/${CLASS_ID}/students/424242/role`)
      .set("Authorization", tokenFor("teacher"))
      .send({ role: "Group Leader" });
    expect(res.status).toBe(404);
  });

  it("rejects a role longer than sixty characters", async () => {
    const res = await request(buildApp())
      .put(`/api/classes/${CLASS_ID}/students/${MEMBER_ID}/role`)
      .set("Authorization", tokenFor("teacher"))
      .send({ role: "x".repeat(61) });
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/classes, plan capacity gate", () => {
  /**
   * Drive the two reads the capacity check makes: the acting account's plan,
   * and how many classes it already owns. Everything else on this route is
   * covered by the ownership tests above.
   */
  function mockOwnedClasses(plan: string, owned: number) {
    vi.mocked(db.select).mockImplementation(
      ((projection?: Record<string, unknown>) => ({
        from: (table: { _name: string }) => ({
          where: () => {
            if (table._name === "users") {
              return Promise.resolve([
                {
                  id: TEACHER_ID,
                  role: "teacher",
                  activeRole: "teacher",
                  plan,
                  planExpiresAt: null,
                },
              ]);
            }
            if (projection && "count" in projection) {
              return Promise.resolve([{ count: owned }]);
            }
            return Promise.resolve([CLASS_ROW]);
          },
        }),
      })) as unknown as typeof db.select,
    );
  }

  beforeEach(() => {
    mockActorRole = "teacher";
    vi.clearAllMocks();
  });

  it("refuses a second class on Free and names the plan that would allow it", async () => {
    mockOwnedClasses("free", 1);

    const res = await request(buildApp())
      .post("/api/classes")
      .set("Authorization", tokenFor("teacher"))
      .send({ name: "Second Class", subject: "Maths", gradeLevel: "Grade 5" });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: "PLAN_LIMIT_REACHED",
      capacity: "classes-owned",
      limit: 1,
      used: 1,
      // Class creation is teacher-only, so the upsell names the teacher plan.
      requiredPlan: "teacher-plus",
    });
    // The refusal must happen before the write, not after it.
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("lets a Teacher Plus teacher past the Free ceiling", async () => {
    mockOwnedClasses("teacher-plus", 1);
    const returning = vi.fn().mockResolvedValue([CLASS_ROW]);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning,
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    } as never);

    const res = await request(buildApp())
      .post("/api/classes")
      .set("Authorization", tokenFor("teacher"))
      .send({ name: "Second Class", subject: "Maths", gradeLevel: "Grade 5" });

    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("POST /api/classes/:id/seating-plan/suggest, subscription gate", () => {
  it("rejects a Free teacher before generating a seating assignment", async () => {
    vi.mocked(getAccountEntitlements).mockResolvedValueOnce(
      entitlementsForPlan("free", null, "teacher"),
    );

    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/seating-plan/suggest`)
      .set("Authorization", tokenFor("teacher"))
      .send({ priorities: null });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: "SUBSCRIPTION_REQUIRED",
      requiredPlan: "teacher-pro",
    });
  });

  it("rejects Teacher Plus too: the planner lives on the Pro level", async () => {
    vi.mocked(getAccountEntitlements).mockResolvedValueOnce(
      entitlementsForPlan("teacher-plus", null, "teacher"),
    );

    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/seating-plan/suggest`)
      .set("Authorization", tokenFor("teacher"))
      .send({ priorities: null });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ code: "SUBSCRIPTION_REQUIRED" });
  });

  it("rejects a teacher holding a student plan: roles do not mix", async () => {
    // A Student Pro plan on a teacher account resolves to Free, so the
    // teacher-only seating planner stays locked despite the paid plan.
    vi.mocked(getAccountEntitlements).mockResolvedValueOnce(
      entitlementsForPlan("student-pro", null, "teacher"),
    );

    const res = await request(buildApp())
      .post(`/api/classes/${CLASS_ID}/seating-plan/suggest`)
      .set("Authorization", tokenFor("teacher"))
      .send({ priorities: null });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ code: "SUBSCRIPTION_REQUIRED" });
  });
});
