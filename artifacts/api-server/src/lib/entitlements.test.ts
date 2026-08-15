/**
 * Tests for the tier model:
 *  • role-specific plans never grant across roles ("roles do not mix")
 *  • every tier is finite — uncapped is an admin property, not a plan
 *  • Free keeps a small AI taste on every rate
 *  • ladders are monotonic: paying more never buys less within a family
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { select: vi.fn() },
    usersTable: stub("users"),
  };
});

import { db } from "@workspace/db";
import {
  AI_RATES_BY_TIER,
  CAPACITY_BY_TIER,
  capacityLimitFor,
  entitlementsForPlan,
  isPlanActive,
  isPremiumAccount,
  normalizePlan,
  planForEntitlementIds,
  planLevel,
  planRoleRequirement,
  upgradeTargetFor,
  type PlanCapacity,
  type SubscriptionTier,
} from "./entitlements.js";

const ALL_TIERS: SubscriptionTier[] = [
  "free",
  "plus",
  "pro",
  "student-plus",
  "student-pro",
  "teacher-plus",
  "teacher-pro",
];

const CAPACITIES: PlanCapacity[] = [
  "classes-owned",
  "class-members",
  "study-activities",
  "resource-lists",
  "learning-goals",
  "canvases",
];

function mockAccountRow(row: Record<string, unknown> | null) {
  vi.mocked(db.select).mockImplementation(
    () =>
      ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(row ? [row] : []),
      }) as unknown as ReturnType<typeof db.select>,
  );
}

describe("isPlanActive", () => {
  it("is false for the free plan and unknown values", () => {
    expect(isPlanActive("free", null)).toBe(false);
    expect(isPlanActive("enterprise", null)).toBe(false);
    expect(isPlanActive(null, null)).toBe(false);
  });

  it("is true for every stored paid plan value", () => {
    for (const plan of [
      "premium",
      "plus",
      "pro",
      "student-plus",
      "student-pro",
      "teacher-plus",
      "teacher-pro",
    ]) {
      expect(isPlanActive(plan, null)).toBe(true);
    }
  });

  it("is false once the plan has expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isPlanActive("teacher-pro", past)).toBe(false);
  });
});

describe("roles do not mix", () => {
  it("grants a student plan only on a student account", () => {
    expect(normalizePlan("student-pro", null, "student")).toBe("student-pro");
    expect(normalizePlan("student-pro", null, "teacher")).toBe("free");
    expect(normalizePlan("student-pro", null, "admin")).toBe("free");
    expect(normalizePlan("student-pro", null, null)).toBe("free");
  });

  it("grants a teacher plan only on a teacher account", () => {
    expect(normalizePlan("teacher-plus", null, "teacher")).toBe("teacher-plus");
    expect(normalizePlan("teacher-plus", null, "student")).toBe("free");
  });

  it("keeps the generic plans role-agnostic", () => {
    for (const role of ["student", "teacher", "admin", null]) {
      expect(normalizePlan("plus", null, role)).toBe("plus");
      expect(normalizePlan("pro", null, role)).toBe("pro");
      expect(normalizePlan("premium", null, role)).toBe("pro");
    }
  });

  it("never leaks the seating planner to a student-held plan", () => {
    // The feature lives on the Pro level of plans a teacher can hold.
    expect(
      entitlementsForPlan("student-pro", null, "student").features[
        "seating-planner"
      ],
    ).toBe(false);
    expect(
      entitlementsForPlan("teacher-pro", null, "teacher").features[
        "seating-planner"
      ],
    ).toBe(true);
    expect(
      entitlementsForPlan("pro", null, "teacher").features["seating-planner"],
    ).toBe(true);
    expect(
      entitlementsForPlan("teacher-plus", null, "teacher").features[
        "seating-planner"
      ],
    ).toBe(false);
  });

  it("declares which role each tier is reserved for", () => {
    expect(planRoleRequirement("student-plus")).toBe("student");
    expect(planRoleRequirement("teacher-pro")).toBe("teacher");
    expect(planRoleRequirement("plus")).toBeNull();
    expect(planRoleRequirement("free")).toBeNull();
  });
});

describe("the free AI taste", () => {
  it("gives Free a small but non-zero allowance on every AI rate", () => {
    const taste = AI_RATES_BY_TIER.free;
    expect(taste.searchPerDay).toBeGreaterThan(0);
    expect(taste.deepPerDay).toBeGreaterThan(0);
    expect(taste.deepPerMonth).toBeGreaterThan(0);
    // A taste, not a plan: strictly below every paid allowance.
    for (const tier of ALL_TIERS.filter((t) => t !== "free")) {
      expect(taste.searchPerDay).toBeLessThan(
        AI_RATES_BY_TIER[tier].searchPerDay,
      );
      expect(taste.deepPerMonth).toBeLessThan(
        AI_RATES_BY_TIER[tier].deepPerMonth,
      );
    }
  });

  it("marks the AI features as available on every tier", () => {
    for (const tier of ALL_TIERS) {
      const e = entitlementsForPlan(tier === "free" ? "free" : tier, null,
        planRoleRequirement(tier));
      expect(e.features["ai-discovery"]).toBe(true);
      expect(e.features["deep-research"]).toBe(true);
    }
  });
});

describe("nothing is uncapped", () => {
  it("has a finite capacity for every tier and every capacity", () => {
    for (const tier of ALL_TIERS) {
      for (const capacity of CAPACITIES) {
        const limit = capacityLimitFor(tier, capacity);
        expect(limit, `${tier}/${capacity}`).not.toBeNull();
        expect(limit as number).toBeGreaterThan(0);
      }
    }
  });

  it("has finite AI rates for every tier", () => {
    for (const tier of ALL_TIERS) {
      const rates = AI_RATES_BY_TIER[tier];
      expect(Number.isFinite(rates.searchPerDay)).toBe(true);
      expect(Number.isFinite(rates.deepPerDay)).toBe(true);
      expect(Number.isFinite(rates.deepPerMonth)).toBe(true);
    }
  });
});

describe("ladders are monotonic", () => {
  /**
   * Within each family the paid steps must never shrink an allowance
   * relative to Free or to each other. Student tiers deliberately keep the
   * Free class columns (students cannot create classes), so "not smaller"
   * is the invariant, not "strictly bigger".
   */
  const FAMILIES: SubscriptionTier[][] = [
    ["free", "plus", "pro"],
    ["free", "student-plus", "student-pro"],
    ["free", "teacher-plus", "teacher-pro"],
  ];

  it("never shrinks a capacity as the plan gets more expensive", () => {
    for (const family of FAMILIES) {
      for (const capacity of CAPACITIES) {
        for (let i = 1; i < family.length; i += 1) {
          const cheaper = capacityLimitFor(family[i - 1], capacity) as number;
          const dearer = capacityLimitFor(family[i], capacity) as number;
          expect(
            dearer,
            `${family[i]} vs ${family[i - 1]} on ${capacity}`,
          ).toBeGreaterThanOrEqual(cheaper);
        }
      }
    }
  });

  it("never shrinks an AI rate as the plan gets more expensive", () => {
    for (const family of FAMILIES) {
      for (let i = 1; i < family.length; i += 1) {
        const cheaper = AI_RATES_BY_TIER[family[i - 1]];
        const dearer = AI_RATES_BY_TIER[family[i]];
        expect(dearer.searchPerDay).toBeGreaterThanOrEqual(cheaper.searchPerDay);
        expect(dearer.deepPerDay).toBeGreaterThanOrEqual(cheaper.deepPerDay);
        expect(dearer.deepPerMonth).toBeGreaterThanOrEqual(cheaper.deepPerMonth);
      }
    }
  });

  it("specialises each role's tiers against the generic level", () => {
    // Students buy study depth beyond the generic plan of the same level...
    expect(
      capacityLimitFor("student-plus", "study-activities") as number,
    ).toBeGreaterThan(capacityLimitFor("plus", "study-activities") as number);
    // ...teachers buy classroom scale beyond it...
    expect(
      capacityLimitFor("teacher-plus", "class-members") as number,
    ).toBeGreaterThan(capacityLimitFor("plus", "class-members") as number);
    expect(
      capacityLimitFor("teacher-pro", "classes-owned") as number,
    ).toBeGreaterThan(capacityLimitFor("pro", "classes-owned") as number);
    // ...and neither pays for the other role's speciality.
    expect(capacityLimitFor("student-pro", "classes-owned")).toBe(
      capacityLimitFor("free", "classes-owned"),
    );
  });
});

describe("plan levels and upgrades", () => {
  it("collapses tiers to price levels", () => {
    expect(planLevel("free")).toBe("free");
    expect(planLevel("student-plus")).toBe("plus");
    expect(planLevel("teacher-plus")).toBe("plus");
    expect(planLevel("pro")).toBe("pro");
    expect(planLevel("student-pro")).toBe("pro");
  });

  it("recommends from the account's own ladder", () => {
    // A free teacher who needs a 120-seat roster: Teacher Plus (150) fits.
    expect(upgradeTargetFor("class-members", "teacher", 120)).toBe(
      "teacher-plus",
    );
    // 200 seats: only Teacher Pro fits.
    expect(upgradeTargetFor("class-members", "teacher", 200)).toBe(
      "teacher-pro",
    );
    // A student who needs 500 activities is pointed at Student Pro,
    // never at a teacher plan.
    expect(upgradeTargetFor("study-activities", "student", 500)).toBe(
      "student-pro",
    );
    // Unknown role falls back to the generic ladder.
    expect(upgradeTargetFor("study-activities", null, 100)).toBe("plus");
  });

  it("names the top of the ladder when nothing fits", () => {
    // Every tier is finite now, so some requests exceed every plan; the top
    // plan is still the honest "gets you furthest" answer.
    expect(upgradeTargetFor("class-members", "teacher", 10_000)).toBe(
      "teacher-pro",
    );
  });

  it("does not recommend a sideways move from a Plus-level plan", () => {
    expect(
      upgradeTargetFor("study-activities", "student", 500, "student-plus"),
    ).toBe("student-pro");
  });
});

describe("planForEntitlementIds", () => {
  it("maps each entitlement to its plan", () => {
    expect(planForEntitlementIds(["teacher-pro"])).toBe("teacher-pro");
    expect(planForEntitlementIds(["student-plus"])).toBe("student-plus");
    expect(planForEntitlementIds(["plus"])).toBe("plus");
    expect(planForEntitlementIds(["premium"])).toBe("pro");
  });

  it("lets the strongest entitlement win when several are active", () => {
    expect(planForEntitlementIds(["plus", "teacher-pro"])).toBe("teacher-pro");
    expect(planForEntitlementIds(["student-plus", "pro"])).toBe("pro");
    expect(planForEntitlementIds(["teacher-plus", "student-plus"])).toBe(
      "teacher-plus",
    );
  });

  it("returns null for unknown entitlements", () => {
    expect(planForEntitlementIds(["battle-pass"])).toBeNull();
    expect(planForEntitlementIds([])).toBeNull();
  });
});

describe("expiry", () => {
  it("downgrades an expired or invalid-dated paid plan to Free", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(normalizePlan("teacher-pro", past, "teacher")).toBe("free");
    expect(normalizePlan("pro", "not-a-date", null)).toBe("free");
  });

  it("keeps a future-dated plan active", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(normalizePlan("student-plus", future, "student")).toBe(
      "student-plus",
    );
  });
});

describe("capacity copies", () => {
  it("hands out a copy so a caller cannot mutate the shared table", () => {
    const entitlements = entitlementsForPlan("free", null);
    entitlements.capacity["classes-owned"] = 999;
    entitlements.ai.searchPerDay = 999;
    expect(CAPACITY_BY_TIER.free["classes-owned"]).toBe(1);
    expect(AI_RATES_BY_TIER.free.searchPerDay).toBe(2);
  });
});

describe("isPremiumAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is true for an active generic or role-matched plan", async () => {
    mockAccountRow({ plan: "premium", expiresAt: null, role: "student" });
    await expect(isPremiumAccount(1)).resolves.toBe(true);
    mockAccountRow({ plan: "teacher-pro", expiresAt: null, role: "teacher" });
    await expect(isPremiumAccount(1)).resolves.toBe(true);
  });

  it("is false when the plan's role does not match the account", async () => {
    mockAccountRow({ plan: "teacher-pro", expiresAt: null, role: "student" });
    await expect(isPremiumAccount(1)).resolves.toBe(false);
  });

  it("is false for free, missing, or expired accounts", async () => {
    mockAccountRow({ plan: "free", expiresAt: null, role: "student" });
    await expect(isPremiumAccount(1)).resolves.toBe(false);
    mockAccountRow(null);
    await expect(isPremiumAccount(999)).resolves.toBe(false);
    mockAccountRow({
      plan: "premium",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      role: "teacher",
    });
    await expect(isPremiumAccount(1)).resolves.toBe(false);
  });
});
