import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/** RevenueCat entitlement identifiers. `premium` is kept for legacy buyers. */
export const PLUS_ENTITLEMENT = "plus";
export const PRO_ENTITLEMENT = "pro";
export const PREMIUM_ENTITLEMENT = "premium";

export const PLAN_FREE = "free";
export const PLAN_PLUS = "plus";
export const PLAN_PRO = "pro";
export const PLAN_PREMIUM = "premium";

export type SubscriptionTier = "free" | "plus" | "pro";
export type PlanFeature =
  | "ai-discovery"
  | "deep-research"
  | "seating-planner";

/**
 * Things a plan lets an account accumulate, as opposed to things it lets an
 * account do. Every key here maps to rows in one table, so a tier is also a
 * statement about how much database an account may occupy. A plan built only
 * on AI call counts prices the cheap part of the product: an abandoned free
 * account with forty classes and a thousand activities costs storage, backup
 * and query time every day, while its AI spend stopped months ago.
 */
export type PlanCapacity =
  | "classes-owned"
  | "class-members"
  | "study-activities"
  | "resource-lists"
  | "learning-goals"
  | "canvases";

/** Row budgets per capacity. `null` means the plan sets no cap. */
export type CapacityLimits = Record<PlanCapacity, number | null>;

/**
 * The single source of truth for capacity. The usage endpoint, the enforcement
 * helper and the tests all read this table, so a limit shown to a user and a
 * limit applied by the server cannot drift apart.
 *
 * `class-members` is charged to the teacher who owns the class, not to the
 * student joining it: the roster is the teacher's data, and a student cannot
 * be asked to pay for a class they were invited into.
 */
export const CAPACITY_BY_TIER: Record<SubscriptionTier, CapacityLimits> = {
  free: {
    "classes-owned": 1,
    "class-members": 30,
    "study-activities": 25,
    "resource-lists": 5,
    "learning-goals": 10,
    canvases: 3,
  },
  plus: {
    "classes-owned": 5,
    "class-members": 100,
    "study-activities": 250,
    "resource-lists": 50,
    "learning-goals": 100,
    canvases: 30,
  },
  pro: {
    "classes-owned": null,
    "class-members": null,
    "study-activities": null,
    "resource-lists": null,
    "learning-goals": null,
    canvases: null,
  },
};

export interface AccountEntitlements {
  tier: SubscriptionTier;
  label: "Free" | "Plus" | "Pro";
  unlimitedAi: boolean;
  features: Record<PlanFeature, boolean>;
  capacity: CapacityLimits;
}

function expiryIsActive(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

/** Normalise stored and legacy plan values into the public three-tier model. */
export function normalizePlan(
  plan: string | null,
  expiresAt: string | null,
): SubscriptionTier {
  if (!expiryIsActive(expiresAt)) return PLAN_FREE;
  if (plan === PLAN_PLUS) return PLAN_PLUS;
  if (plan === PLAN_PRO || plan === PLAN_PREMIUM) return PLAN_PRO;
  return PLAN_FREE;
}

export function entitlementsForPlan(
  plan: string | null,
  expiresAt: string | null,
): AccountEntitlements {
  const tier = normalizePlan(plan, expiresAt);
  const paidAi = tier === PLAN_PLUS || tier === PLAN_PRO;
  return {
    tier,
    label: tier === PLAN_PRO ? "Pro" : tier === PLAN_PLUS ? "Plus" : "Free",
    unlimitedAi: tier === PLAN_PRO,
    features: {
      "ai-discovery": paidAi,
      "deep-research": paidAi,
      "seating-planner": tier === PLAN_PRO,
    },
    capacity: { ...CAPACITY_BY_TIER[tier] },
  };
}

/** The row budget a tier allows for one capacity. `null` means uncapped. */
export function capacityLimitFor(
  tier: SubscriptionTier,
  capacity: PlanCapacity,
): number | null {
  return CAPACITY_BY_TIER[tier][capacity];
}

/**
 * The cheapest plan that would actually fit `needed` rows, so the upsell names
 * a plan that solves the problem. Recommending Plus to a teacher who needs a
 * 400-student roster just moves the same refusal one payment later.
 */
export function upgradeTargetFor(
  capacity: PlanCapacity,
  tier: SubscriptionTier,
  needed: number,
): "plus" | "pro" {
  if (tier === PLAN_FREE) {
    const plusLimit = CAPACITY_BY_TIER.plus[capacity];
    if (plusLimit === null || needed <= plusLimit) return PLAN_PLUS;
  }
  return PLAN_PRO;
}

export async function getAccountEntitlements(
  userId: number,
): Promise<AccountEntitlements> {
  const [row] = await db
    .select({ plan: usersTable.plan, expiresAt: usersTable.planExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return entitlementsForPlan(row?.plan ?? null, row?.expiresAt ?? null);
}

export async function accountHasFeature(
  userId: number,
  feature: PlanFeature,
): Promise<boolean> {
  return (await getAccountEntitlements(userId)).features[feature];
}

/** Compatibility helper used by older limiters: true for either paid tier. */
export async function isPremiumAccount(userId: number): Promise<boolean> {
  return (await getAccountEntitlements(userId)).tier !== PLAN_FREE;
}

/** Compatibility predicate: true for any active paid plan. */
export function isPlanActive(
  plan: string | null,
  expiresAt: string | null,
): boolean {
  return normalizePlan(plan, expiresAt) !== PLAN_FREE;
}
