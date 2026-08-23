/**
 * @fileOverview Backend domain role: centralizes Entitlements logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
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

export interface AccountEntitlements {
  tier: SubscriptionTier;
  label: "Free" | "Plus" | "Pro";
  unlimitedAi: boolean;
  features: Record<PlanFeature, boolean>;
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
  };
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
