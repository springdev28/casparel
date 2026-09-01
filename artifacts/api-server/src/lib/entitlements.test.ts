/**
 * @fileOverview Verification role: exercises Entitlements.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Tests for the tier model:
 *  • account roles never change billing products or allowances
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
import { INSTITUTIONAL_STARTER } from "@workspace/plan-economics";
import {
  AI_RATES_BY_TIER,
  CAPACITY_BY_TIER,
  capacityLimitFor,
  entitlementsForPlan,
  hasBuiltInGeneralProAccess,
  isPlanActive,
  isPremiumAccount,
  normalizePlan,
  planForEntitlementIds,
  planForProductIds,
  planLevel,
  planRoleRequirement,
  resolveAccountPlan,
  upgradeTargetFor,
  type PlanCapacity,
  type SubscriptionTier,
} from "./entitlements.js";

const ALL_TIERS: SubscriptionTier[] = [
  "free",
  "plus",
  "pro",
  "institutional",
];

const CAPACITIES: PlanCapacity[] = [
  "classes-owned",
  "class-members",
  "study-activities",
  "resource-lists",
  "learning-goals",
  "canvases",
];

describe("built-in general Pro access", () => {
  it("belongs only to the review account and is case-insensitive", () => {
    expect(hasBuiltInGeneralProAccess("review@casparel.com")).toBe(true);
    expect(hasBuiltInGeneralProAccess(" Review@Casparel.com ")).toBe(true);
    expect(hasBuiltInGeneralProAccess("support@casparel.com")).toBe(false);
  });

  it("resolves the review account as role-agnostic Pro even from a free row", async () => {
    mockAccountRow({
      email: "review@casparel.com",
      plan: "free",
      expiresAt: null,
      role: "student",
    });
    const result = await resolveAccountPlan(1);
    expect(result.entitlements.tier).toBe("pro");
    expect(result.entitlements.planRole).toBeNull();
    expect(result.isAdmin).toBe(false);
  });
});

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
      "institutional",
    ]) {
      expect(isPlanActive(plan, null)).toBe(true);
    }
  });

  it("is false once the plan has expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isPlanActive("teacher-pro", past)).toBe(false);
  });
});

describe("plan and account role stay separate", () => {
  it("keeps Plus and Pro role-agnostic", () => {
    for (const role of ["student", "teacher", "admin", null]) {
      expect(normalizePlan("plus", null, role)).toBe("plus");
      expect(normalizePlan("pro", null, role)).toBe("pro");
      expect(normalizePlan("premium", null, role)).toBe("pro");
    }
  });

  it("collapses legacy role-specific rows without consulting role", () => {
    expect(normalizePlan("student-plus", null, "teacher")).toBe("plus");
    expect(normalizePlan("teacher-plus", null, "student")).toBe("plus");
    expect(normalizePlan("student-pro", null, "teacher")).toBe("pro");
    expect(normalizePlan("teacher-pro", null, "student")).toBe("pro");
  });

  it("grants the school licence on any account role", () => {
    for (const role of ["student", "teacher", "admin", null]) {
      expect(normalizePlan("institutional", null, role)).toBe("institutional");
    }
    expect(planRoleRequirement("institutional")).toBeNull();
  });

  it("gives Pro features independently of role", () => {
    expect(
      entitlementsForPlan("pro", null, "student").features["seating-planner"],
    ).toBe(true);
    expect(
      entitlementsForPlan("plus", null, "teacher").features["seating-planner"],
    ).toBe(false);
  });

  it("declares no role requirement for any plan", () => {
    expect(planRoleRequirement("plus")).toBeNull();
    expect(planRoleRequirement("pro")).toBeNull();
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
  const FAMILIES: SubscriptionTier[][] = [["free", "plus", "pro"]];

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

  it("puts the school licence at or above every tier on every allowance", () => {
    for (const tier of ALL_TIERS.filter((t) => t !== "institutional")) {
      for (const capacity of CAPACITIES) {
        expect(
          capacityLimitFor("institutional", capacity) as number,
          `institutional vs ${tier} on ${capacity}`,
        ).toBeGreaterThanOrEqual(capacityLimitFor(tier, capacity) as number);
      }
      const rates = AI_RATES_BY_TIER[tier];
      expect(INSTITUTIONAL_STARTER.searchPerDay).toBeGreaterThanOrEqual(rates.searchPerDay);
      expect(INSTITUTIONAL_STARTER.searchPerMonth).toBeGreaterThanOrEqual(rates.searchPerMonth);
      expect(INSTITUTIONAL_STARTER.deepPerDay).toBeGreaterThanOrEqual(rates.deepPerDay);
      expect(INSTITUTIONAL_STARTER.deepPerMonth).toBeGreaterThanOrEqual(rates.deepPerMonth);
    }
    // At the top and still finite: the "nothing is uncapped" suite already
    // covers institutional through ALL_TIERS; this pins the seating planner.
    expect(
      entitlementsForPlan("institutional", null, "teacher").features[
        "seating-planner"
      ],
    ).toBe(true);
  });

  it("gives Pro at least every Plus allowance", () => {
    for (const capacity of CAPACITIES) {
      expect(capacityLimitFor("pro", capacity)).toBeGreaterThanOrEqual(
        capacityLimitFor("plus", capacity),
      );
    }
  });
});

describe("plan levels and upgrades", () => {
  it("collapses tiers to price levels", () => {
    expect(planLevel("free")).toBe("free");
    expect(planLevel("plus")).toBe("plus");
    expect(planLevel("pro")).toBe("pro");
  });

  it("recommends the same ladder for every role", () => {
    expect(upgradeTargetFor("class-members", "teacher", 80)).toBe("plus");
    expect(upgradeTargetFor("class-members", "student", 200)).toBe("pro");
    expect(upgradeTargetFor("study-activities", null, 100)).toBe("plus");
  });

  it("names the top of the ladder when nothing fits", () => {
    // Every tier is finite now, so some requests exceed every plan; the top
    // plan is still the honest "gets you furthest" answer.
    expect(upgradeTargetFor("class-members", "teacher", 10_000)).toBe("pro");
  });

  it("does not recommend a sideways move from a Plus-level plan", () => {
    expect(
      upgradeTargetFor("study-activities", "student", 500, "plus"),
    ).toBe("pro");
  });

  it("never recommends a smaller plan to a school-licensed account", () => {
    expect(
      upgradeTargetFor("classes-owned", "teacher", 60, "institutional"),
    ).toBe("institutional");
  });
});

describe("planForEntitlementIds", () => {
  it("maps each entitlement to its plan", () => {
    expect(planForEntitlementIds(["teacher-pro"])).toBe("pro");
    expect(planForEntitlementIds(["student-plus"])).toBe("plus");
    expect(planForEntitlementIds(["plus"])).toBe("plus");
    expect(planForEntitlementIds(["premium"])).toBe("pro");
  });

  it("lets the strongest entitlement win when several are active", () => {
    expect(planForEntitlementIds(["plus", "teacher-pro"])).toBe("pro");
    expect(planForEntitlementIds(["student-plus", "pro"])).toBe("pro");
    expect(planForEntitlementIds(["teacher-plus", "student-plus"])).toBe("plus");
    expect(planForEntitlementIds(["teacher-pro", "institutional"])).toBe(
      "institutional",
    );
  });

  it("returns null for unknown entitlements", () => {
    expect(planForEntitlementIds(["battle-pass"])).toBeNull();
    expect(planForEntitlementIds([])).toBeNull();
  });
});

describe("planForProductIds", () => {
  it("maps the four production products without guessing", () => {
    expect(planForProductIds(["casparel_plus_monthly"])).toBe("plus");
    expect(planForProductIds(["casparel_plus_yearly"])).toBe("plus");
    expect(planForProductIds(["casparel_pro_monthly"])).toBe("pro");
    expect(planForProductIds(["casparel_pro_yearly"])).toBe("pro");
  });

  it("ignores unknown or absent products", () => {
    expect(planForProductIds(["battle_pass"])).toBeNull();
    expect(planForProductIds([])).toBeNull();
  });
});

describe("expiry", () => {
  it("downgrades an expired or invalid-dated paid plan to Free", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(normalizePlan("pro", past, "teacher")).toBe("free");
    expect(normalizePlan("pro", "not-a-date", null)).toBe("free");
  });

  it("keeps a future-dated plan active", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(normalizePlan("plus", future, "student")).toBe("plus");
  });
});

describe("capacity copies", () => {
  it("hands out a copy so a caller cannot mutate the shared table", () => {
    const entitlements = entitlementsForPlan("free", null);
    entitlements.capacity["classes-owned"] = 999;
    entitlements.ai.searchPerDay = 999;
    expect(CAPACITY_BY_TIER.free["classes-owned"]).toBe(1);
    expect(AI_RATES_BY_TIER.free.searchPerDay).toBe(1);
  });
});

describe("isPremiumAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is true for an active generic or legacy plan", async () => {
    mockAccountRow({ plan: "premium", expiresAt: null, role: "student" });
    await expect(isPremiumAccount(1)).resolves.toBe(true);
    mockAccountRow({ plan: "teacher-pro", expiresAt: null, role: "teacher" });
    await expect(isPremiumAccount(1)).resolves.toBe(true);
  });

  it("stays true when a legacy plan's former role does not match", async () => {
    mockAccountRow({ plan: "teacher-pro", expiresAt: null, role: "student" });
    await expect(isPremiumAccount(1)).resolves.toBe(true);
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
