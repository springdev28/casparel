/**
 * @fileOverview Backend domain role: centralizes Entitlements logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  PLAN_CATALOG,
  type AiLimits,
  type CapacityLimits,
  type PlanCapacity,
  type SubscriptionTier,
} from "@workspace/plan-economics";

export type { PlanCapacity, SubscriptionTier } from "@workspace/plan-economics";

/**
 * RevenueCat grants `plus` and `pro`. The remaining identifiers are accepted
 * only for safe reconciliation of historical events and immediately collapse
 * to generic Plus, Pro, or the existing manual Institutional licence.
 */
export const PLUS_ENTITLEMENT = "plus";
export const PRO_ENTITLEMENT = "pro";
export const PREMIUM_ENTITLEMENT = "premium";
export const STUDENT_PLUS_ENTITLEMENT = "student-plus";
export const STUDENT_PRO_ENTITLEMENT = "student-pro";
export const TEACHER_PLUS_ENTITLEMENT = "teacher-plus";
export const TEACHER_PRO_ENTITLEMENT = "teacher-pro";
export const INSTITUTIONAL_ENTITLEMENT = "institutional";

export const PLAN_FREE = "free";
export const PLAN_PLUS = "plus";
export const PLAN_PRO = "pro";
export const PLAN_PREMIUM = "premium";
export const PLAN_STUDENT_PLUS = "student-plus";
export const PLAN_STUDENT_PRO = "student-pro";
export const PLAN_TEACHER_PLUS = "teacher-plus";
export const PLAN_TEACHER_PRO = "teacher-pro";
export const PLAN_INSTITUTIONAL = "institutional";

/**
 * Product-owned accounts that receive the original, role-agnostic Pro plan
 * without a store subscription. Keep support@casparel.com out of this list:
 * it is a public contact mailbox, not a Casparel user account.
 */
const BUILT_IN_GENERAL_PRO_EMAILS = new Set(["review@casparel.com"]);

export function hasBuiltInGeneralProAccess(email: string): boolean {
  return BUILT_IN_GENERAL_PRO_EMAILS.has(email.trim().toLowerCase());
}

/**
 * The public tier model.
 *
 * `plus` and `pro` are role-agnostic plans. Student and teacher remain account
 * roles only and do not affect billing, entitlements, limits, or products.
 *
 * `institutional` is the sales-led school licence: per-seat, invoiced, never
 * sold as a store package. It is manually provisioned and takes precedence
 * over self-serve subscription updates.
 *
 * No tier is uncapped anywhere: every allowance below is finite — including
 * institutional. Uncapped is an administrator property, not something money
 * can buy.
 */
/** Which account role a tier is reserved for. `null` = any role. */
export type PlanRole = "student" | "teacher";

export type PlanFeature =
  | "ai-discovery"
  | "deep-research"
  | "seating-planner";

/** Per-account AI allowances. Finite for every tier; only admins bypass. */
export type AiRates = AiLimits;

export const TIER_LABELS = Object.fromEntries(
  Object.entries(PLAN_CATALOG).map(([tier, plan]) => [tier, plan.label]),
) as Record<SubscriptionTier, string>;

/** Plans are role-agnostic; retained for source compatibility during rollout. */
export function planRoleRequirement(tier: SubscriptionTier): PlanRole | null {
  void tier;
  return null;
}

/**
 * Collapse a tier to its price level, for upgrade CTAs and package pickers.
 * Institutional reports "pro": it sits above Pro, but self-serve checkout has
 * nothing to sell past it, so for every CTA decision ("is there an upgrade to
 * offer?") the answer must be the same as for a Pro account — no.
 */
export function planLevel(tier: SubscriptionTier): "free" | "plus" | "pro" {
  if (tier === PLAN_FREE) return "free";
  if (tier === PLAN_PLUS) return "plus";
  return "pro";
}

/**
 * The Free row is deliberately non-zero on AI: it is a taste, sized so a new
 * account can experience what AI discovery and a cited deep report actually
 * are before being asked to pay, without being large enough to live on.
 */
export const AI_RATES_BY_TIER = Object.fromEntries(
  Object.entries(PLAN_CATALOG).map(([tier, plan]) => [tier, plan.ai]),
) as Record<SubscriptionTier, AiRates>;

/**
 * The single source of truth for stored-data capacity. The usage endpoint,
 * the enforcement helper and the tests all read this table, so a limit shown
 * to a user and a limit applied by the server cannot drift apart.
 *
 * Legacy stored values collapse to the matching generic row and therefore do
 * not create additional public plans.
 */
export const CAPACITY_BY_TIER = Object.fromEntries(
  Object.entries(PLAN_CATALOG).map(([tier, plan]) => [tier, plan.capacity]),
) as Record<SubscriptionTier, CapacityLimits>;

export interface AccountEntitlements {
  tier: SubscriptionTier;
  label: string;
  /** The role this tier is reserved for, or null when any role may hold it. */
  planRole: PlanRole | null;
  ai: AiRates;
  features: Record<PlanFeature, boolean>;
  capacity: CapacityLimits;
}

function expiryIsActive(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

const STORED_PLAN_TO_TIER: Record<string, SubscriptionTier> = {
  [PLAN_PLUS]: "plus",
  [PLAN_PRO]: "pro",
  [PLAN_PREMIUM]: "pro",
  [PLAN_STUDENT_PLUS]: "plus",
  [PLAN_STUDENT_PRO]: "pro",
  [PLAN_TEACHER_PLUS]: "plus",
  [PLAN_TEACHER_PRO]: "pro",
  [PLAN_INSTITUTIONAL]: "institutional",
};

/**
 * Normalise a stored plan value into the tier that actually applies to this
 * account right now.
 *
 * Roles do not participate in subscription normalization. The third argument
 * remains temporarily source-compatible with existing route callers.
 */
export function normalizePlan(
  plan: string | null,
  expiresAt: string | null,
  _accountRole: string | null = null,
): SubscriptionTier {
  if (!expiryIsActive(expiresAt)) return PLAN_FREE;
  const tier = plan ? STORED_PLAN_TO_TIER[plan] : undefined;
  return tier ?? PLAN_FREE;
}

export function entitlementsForPlan(
  plan: string | null,
  expiresAt: string | null,
  accountRole: string | null = null,
): AccountEntitlements {
  const tier = normalizePlan(plan, expiresAt, accountRole);
  return {
    tier,
    label: TIER_LABELS[tier],
    planRole: planRoleRequirement(tier),
    ai: { ...AI_RATES_BY_TIER[tier] },
    features: {
      // Every tier can touch the AI features; the tiers differ in how much.
      "ai-discovery": true,
      "deep-research": true,
      "seating-planner": tier === PLAN_PRO || tier === PLAN_INSTITUTIONAL,
    },
    capacity: { ...CAPACITY_BY_TIER[tier] },
  };
}

/** The row budget a tier allows for one capacity. `null` means uncapped. */
export function capacityLimitFor(
  tier: SubscriptionTier,
  capacity: PlanCapacity,
): number {
  return CAPACITY_BY_TIER[tier][capacity];
}

/**
 * Student and teacher roles share the same self-serve upgrade ladder.
 */
export function upgradeLadderFor(_accountRole: string | null): SubscriptionTier[] {
  return [PLAN_PLUS, PLAN_PRO];
}

/**
 * The cheapest plan on this account's ladder that would fit `needed` rows, so
 * the upsell names a plan that solves the problem. Falls back to the top of
 * the ladder when nothing fits — with every tier finite there are requests no
 * plan satisfies, and the top plan is still the honest answer to "which plan
 * gets me furthest".
 */
const LEVEL_RANK = { free: 0, plus: 1, pro: 2 } as const;

export function upgradeTargetFor(
  capacity: PlanCapacity,
  accountRole: string | null,
  needed: number,
  currentTier: SubscriptionTier = PLAN_FREE,
): SubscriptionTier {
  // Nothing self-serve sits above the school licence, so recommending a
  // ladder step would be a downgrade dressed as an upsell. Naming the current
  // tier makes the 402 read "you are at the top — extend the licence or free
  // up room" instead of pointing at a smaller plan.
  if (currentTier === PLAN_INSTITUTIONAL) return PLAN_INSTITUTIONAL;
  const ladder = upgradeLadderFor(accountRole).filter(
    (step) =>
      step !== currentTier &&
      LEVEL_RANK[planLevel(step)] >= LEVEL_RANK[planLevel(currentTier)],
  );
  for (const step of ladder) {
    const limit = CAPACITY_BY_TIER[step][capacity];
    if (limit === null || needed <= limit) return step;
  }
  return ladder[ladder.length - 1] ?? upgradeLadderFor(accountRole)[1];
}

/**
 * Map RevenueCat entitlements to the four-plan backend model. Historical
 * identifiers remain recognized only to avoid removing paid access during a
 * rolling deployment; none are exposed as a current tier.
 */
export function planForEntitlementIds(ids: string[]): string | null {
  const active = new Set(ids);
  if (active.has(INSTITUTIONAL_ENTITLEMENT)) return PLAN_INSTITUTIONAL;
  if (
    active.has(PRO_ENTITLEMENT) ||
    active.has(PREMIUM_ENTITLEMENT) ||
    active.has(TEACHER_PRO_ENTITLEMENT) ||
    active.has(STUDENT_PRO_ENTITLEMENT)
  ) {
    return PLAN_PRO;
  }
  if (
    active.has(PLUS_ENTITLEMENT) ||
    active.has(TEACHER_PLUS_ENTITLEMENT) ||
    active.has(STUDENT_PLUS_ENTITLEMENT)
  ) return PLAN_PLUS;
  return null;
}

/** Every entitlement identifier this server recognises. */
export const KNOWN_ENTITLEMENTS: ReadonlySet<string> = new Set([
  PLUS_ENTITLEMENT,
  PRO_ENTITLEMENT,
  PREMIUM_ENTITLEMENT,
  STUDENT_PLUS_ENTITLEMENT,
  STUDENT_PRO_ENTITLEMENT,
  TEACHER_PLUS_ENTITLEMENT,
  TEACHER_PRO_ENTITLEMENT,
  INSTITUTIONAL_ENTITLEMENT,
]);

export interface ResolvedAccountPlan {
  entitlements: AccountEntitlements;
  /** The account's base role; activeRole is a view mode and never read here. */
  accountRole: string | null;
  /** Admins bypass every account-level cap. This cannot be bought. */
  isAdmin: boolean;
}

/**
 * One read that answers every plan question for an account. The base `role`
 * column decides role matching — `activeRole` is a display mode a teacher can
 * toggle and must not move their subscription with it.
 */
export async function resolveAccountPlan(
  userId: number,
): Promise<ResolvedAccountPlan> {
  const [row] = await db
    .select({
      email: usersTable.email,
      plan: usersTable.plan,
      expiresAt: usersTable.planExpiresAt,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const accountRole = row?.role ?? null;
  const builtInGeneralPro = Boolean(
    row?.email && hasBuiltInGeneralProAccess(row.email),
  );
  return {
    entitlements: entitlementsForPlan(
      builtInGeneralPro ? PLAN_PRO : (row?.plan ?? null),
      builtInGeneralPro ? null : (row?.expiresAt ?? null),
      accountRole,
    ),
    accountRole,
    isAdmin: accountRole === "admin",
  };
}

export async function getAccountEntitlements(
  userId: number,
): Promise<AccountEntitlements> {
  return (await resolveAccountPlan(userId)).entitlements;
}

export async function accountHasFeature(
  userId: number,
  feature: PlanFeature,
): Promise<boolean> {
  return (await getAccountEntitlements(userId)).features[feature];
}

/** Compatibility helper used by older limiters: true for any paid tier. */
export async function isPremiumAccount(userId: number): Promise<boolean> {
  return (await getAccountEntitlements(userId)).tier !== PLAN_FREE;
}

/** Compatibility predicate: true for any active paid plan (role-agnostic). */
export function isPlanActive(
  plan: string | null,
  expiresAt: string | null,
): boolean {
  if (!expiryIsActive(expiresAt)) return false;
  return Boolean(plan && STORED_PLAN_TO_TIER[plan]);
}
