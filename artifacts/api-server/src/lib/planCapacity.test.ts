/**
 * @fileOverview Verification role: exercises Plan Capacity.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Tests for stored-data plan limits.
 *
 * The database is stubbed so these exercise the decision logic , which tier a
 * limit is read from, who is charged for a class roster, and what the refusal
 * tells the client , rather than Drizzle's query building.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { select: vi.fn() },
    usersTable: stub("users"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
    studyActivitiesTable: stub("study_activities"),
    resourceListsTable: stub("resource_lists"),
    learningGoalsTable: stub("learning_goals"),
    canvasesTable: stub("canvases"),
  };
});

import { db } from "@workspace/db";
import {
  accountCapacity,
  capacityErrorBody,
  classMemberCapacity,
  ensureAccountCapacity,
} from "./planCapacity.js";

type Row = Record<string, unknown>;

/** Route every `select().from().where()` through one handler. */
function mockSelect(
  handler: (projection: Row, table: { _name: string }) => Row[],
) {
  vi.mocked(db.select).mockImplementation(
    ((projection?: Row) => ({
      from: (table: { _name: string }) => ({
        where: () => Promise.resolve(handler(projection ?? {}, table)),
      }),
    })) as unknown as typeof db.select,
  );
}

/** An account on `plan` that already owns `used` rows of whatever is counted. */
function mockAccount(
  plan: string | null,
  used: number,
  role: "student" | "teacher" | "admin" = "teacher",
) {
  mockSelect((_projection, table) => {
    if (table._name === "users") return [{ plan, expiresAt: null, role }];
    return [{ count: used }];
  });
}

describe("accountCapacity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a write that stays inside the plan", async () => {
    mockAccount("free", 3); // Free allows 5 lists
    await expect(
      accountCapacity(1, "resource-lists"),
    ).resolves.toMatchObject({ allowed: true, limit: 5, used: 3, remaining: 2 });
  });

  it("refuses the write that would cross the limit, not the one that reaches it", async () => {
    mockAccount("free", 4);
    await expect(accountCapacity(1, "resource-lists")).resolves.toMatchObject({
      allowed: true,
      used: 4,
    });

    mockAccount("free", 5);
    // The default mock account is a teacher, so the upsell names the teacher
    // ladder, never a generic or student plan.
    await expect(accountCapacity(1, "resource-lists")).resolves.toMatchObject({
      allowed: false,
      used: 5,
      remaining: 0,
      requiredPlan: "teacher-plus",
    });
  });

  it("counts the whole batch, not just one row", async () => {
    mockAccount("free", 3); // 2 slots left of 5
    await expect(
      accountCapacity(1, "resource-lists", 2),
    ).resolves.toMatchObject({ allowed: true });
    mockAccount("free", 3);
    await expect(
      accountCapacity(1, "resource-lists", 3),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("raises the ceiling for Plus and again for Pro, which stays finite", async () => {
    mockAccount("plus", 40);
    await expect(accountCapacity(1, "resource-lists")).resolves.toMatchObject({
      allowed: true,
      limit: 50,
    });

    // No paid tier is uncapped: Pro is big, not infinite.
    mockAccount("pro", 10_000);
    await expect(accountCapacity(1, "resource-lists")).resolves.toMatchObject({
      allowed: false,
      limit: 200,
    });
    mockAccount("pro", 40);
    await expect(accountCapacity(1, "resource-lists")).resolves.toMatchObject({
      allowed: true,
      limit: 200,
    });
  });

  it("resolves a role-mismatched plan as Free", async () => {
    // A teacher holding a student plan gets no benefit from it: roles do not
    // mix, and the stored plan only counts while the role matches.
    mockAccount("student-pro", 20, "teacher");
    await expect(accountCapacity(1, "resource-lists")).resolves.toMatchObject({
      allowed: false,
      tier: "free",
      limit: 5,
    });
  });

  it("treats an expired paid plan as Free", async () => {
    mockSelect((_projection, table) => {
      if (table._name === "users") {
        return [
          {
            plan: "plus",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
            role: "teacher",
          },
        ];
      }
      return [{ count: 20 }];
    });
    await expect(accountCapacity(1, "resource-lists")).resolves.toMatchObject({
      allowed: false,
      tier: "free",
      limit: 5,
    });
  });

  it("leaves admin accounts uncapped, as the AI quotas do", async () => {
    mockAccount("free", 500, "admin");
    await expect(accountCapacity(1, "classes-owned")).resolves.toMatchObject({
      allowed: true,
      limit: null,
    });
  });

  it("names the Pro step when the Plus step would refuse the request too", async () => {
    mockAccount("free", 0);
    await expect(
      accountCapacity(1, "study-activities", 400),
    ).resolves.toMatchObject({ allowed: false, requiredPlan: "teacher-pro" });
  });
});

describe("classMemberCapacity", () => {
  beforeEach(() => vi.clearAllMocks());

  /** A class owned by a teacher on `teacherPlan`, holding `members` people. */
  function mockClass(teacherPlan: string, members: number) {
    mockSelect((projection, table) => {
      if ("teacherId" in projection) return [{ teacherId: 42 }];
      if (table._name === "users") {
        return [{ plan: teacherPlan, expiresAt: null, role: "teacher" }];
      }
      return [{ count: members }];
    });
  }

  it("charges the roster to the teacher who owns the class", async () => {
    // The joining student's own plan is never read: only the teacher's is.
    mockClass("pro", 250);
    await expect(classMemberCapacity(7)).resolves.toMatchObject({
      allowed: true,
      limit: 300,
    });
  });

  it("gives a Teacher Pro roster more room than generic Pro", async () => {
    mockClass("teacher-pro", 350);
    await expect(classMemberCapacity(7)).resolves.toMatchObject({
      allowed: true,
      limit: 400,
    });
  });

  it("stops a full Free roster", async () => {
    mockClass("free", 30);
    await expect(classMemberCapacity(7)).resolves.toMatchObject({
      allowed: false,
      limit: 30,
      used: 30,
      requiredPlan: "teacher-plus",
    });
  });

  it("rejects a bulk invite that would overflow the roster", async () => {
    mockClass("free", 28); // 2 seats left
    await expect(classMemberCapacity(7, 2)).resolves.toMatchObject({
      allowed: true,
    });
    mockClass("free", 28);
    await expect(classMemberCapacity(7, 3)).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("does not block on a class that no longer exists", async () => {
    mockSelect(() => []);
    await expect(classMemberCapacity(999)).resolves.toMatchObject({
      allowed: true,
    });
  });
});

describe("the refusal sent to the client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carries the numbers as data, not only prose", async () => {
    mockAccount("free", 25);
    const decision = await accountCapacity(1, "study-activities");
    const body = capacityErrorBody("study-activities", decision);
    expect(body).toMatchObject({
      code: "PLAN_LIMIT_REACHED",
      capacity: "study-activities",
      limit: 25,
      used: 25,
      requiredPlan: "teacher-plus",
    });
    expect(body.error).toContain("25");
    expect(body.error).toContain("Teacher Plus");
  });

  it("sends 402 and reports that the route must stop", async () => {
    mockAccount("free", 25);
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) };
    await expect(
      ensureAccountCapacity(
        res as never,
        1,
        "study-activities",
      ),
    ).resolves.toBe(false);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PLAN_LIMIT_REACHED" }),
    );
  });

  it("stays quiet and lets the route continue when there is room", async () => {
    mockAccount("free", 1);
    const status = vi.fn();
    await expect(
      ensureAccountCapacity({ status } as never, 1, "study-activities"),
    ).resolves.toBe(true);
    expect(status).not.toHaveBeenCalled();
  });
});
