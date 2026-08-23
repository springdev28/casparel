/**
 * @fileOverview Backend domain role: centralizes Entitlements logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/**
 * RevenueCat entitlement identifiers. `premium` is kept for legacy buyers and
 * resolves to the generic Pro plan. The role-specific identifiers must match
 * the entitlements configured in the RevenueCat dashboard.
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
 * The public tier model.
 *
 * `plus` and `pro` are the original role-agnostic plans and remain valid and
 * purchasable; the role-specific tiers specialise them. Student tiers buy
 * depth for personal study (activities, goals, lists, canvases, research);
 * teacher tiers buy classroom scale (classes, rosters, and on Teacher Pro the
 * explainable seating planner).
 *
 * `institutional` is the sales-led school licence: per-seat, invoiced, never
 * sold as a store package. It applies to any account role and sits above both
 * Pro specialisations on every allowance. It is fulfilled by granting the
 * `institutional` RevenueCat entitlement to each licensed account (or by
 * setting the plan directly), so it flows through the same webhook pipeline
 * as every purchased plan.
 *
 * No tier is uncapped anywhere: every allowance below is finite — including
 * institutional. Uncapped is an administrator property, not something money
 * can buy.
 */
export type SubscriptionTier =
  | "free"
  | "plus"
  | "pro"
  | "student-plus"
  | "student-pro"
  | "teacher-plus"
  | "teacher-pro"
  | "institutional";

/** Which account role a tier is reserved for. `null` = any role. */
export type PlanRole = "student" | "teacher";

export type PlanFeature =
  | "ai-discovery"
  | "deep-research"
  | "seating-planner";

export type PlanCapacity =
  | "classes-owned"
  | "class-members"
  | "study-activities"
  | "resource-lists"
  | "learning-goals"
  | "canvases";

/** Row budgets per capacity. `null` means uncapped — admin accounts only. */
export type CapacityLimits = Record<PlanCapacity, number | null>;

/** Per-account AI allowances. Finite for every tier; only admins bypass. */
export interface AiRates {
  /** AI discovery fallback searches per day. */
  searchPerDay: number;
  /** Deep source-research reports per day. */
  deepPerDay: number;
  /** Deep source-research reports per rolling 30 days. */
  deepPerMonth: number;
}

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  "student-plus": "Student Plus",
  "student-pro": "Student Pro",
  "teacher-plus": "Teacher Plus",
  "teacher-pro": "Teacher Pro",
  institutional: "Institutional",
};

/** The account role a tier requires, or null when any role may hold it. */
export function planRoleRequirement(tier: SubscriptionTier): PlanRole | null {
  if (tier === PLAN_STUDENT_PLUS || tier === PLAN_STUDENT_PRO) return "student";
  if (tier === PLAN_TEACHER_PLUS || tier === PLAN_TEACHER_PRO) return "teacher";
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
  if (tier === PLAN_PLUS || tier === PLAN_STUDENT_PLUS || tier === PLAN_TEACHER_PLUS)
    return "plus";
  return "pro";
}

/**
 * The Free row is deliberately non-zero on AI: it is a taste, sized so a new
 * account can experience what AI discovery and a cited deep report actually
 * are before being asked to pay, without being large enough to live on.
 */
export const AI_RATES_BY_TIER: Record<SubscriptionTier, AiRates> = {
  // Free's deep taste is a flat 2 per rolling 30 days. deepPerDay equals
  // deepPerMonth so the daily window can never be the binding cap — "1 a day
  // but 2 a month" read as a maths error, and it effectively was one.
  free: { searchPerDay: 2, deepPerDay: 2, deepPerMonth: 2 },
  plus: { searchPerDay: 20, deepPerDay: 5, deepPerMonth: 50 },
  pro: { searchPerDay: 60, deepPerDay: 15, deepPerMonth: 150 },
  "student-plus": { searchPerDay: 30, deepPerDay: 8, deepPerMonth: 80 },
  "student-pro": { searchPerDay: 90, deepPerDay: 25, deepPerMonth: 250 },
  "teacher-plus": { searchPerDay: 20, deepPerDay: 5, deepPerMonth: 50 },
  "teacher-pro": { searchPerDay: 60, deepPerDay: 15, deepPerMonth: 150 },
  // Above both Pro specialisations, still finite: a licensed seat is not an
  // admin account, and the daily window bounds worst-case AI spend per seat.
  institutional: { searchPerDay: 120, deepPerDay: 30, deepPerMonth: 300 },
};

/**
 * The single source of truth for stored-data capacity. The usage endpoint,
 * the enforcement helper and the tests all read this table, so a limit shown
 * to a user and a limit applied by the server cannot drift apart.
 *
 * Shape notes:
 * - Student tiers keep the Free class columns: students cannot create classes,
 *   and a roster is always charged to the teacher who owns the class.
 * - Teacher tiers keep the study columns of their generic level: teachers
 *   build materials too, but classroom scale is what they are paying for.
 * - Pro rows are large but finite. Legacy `premium` buyers resolve to `pro`
 *   and therefore also have finite caps now.
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
    "classes-owned": 20,
    "class-members": 300,
    "study-activities": 1000,
    "resource-lists": 200,
    "learning-goals": 400,
    canvases: 100,
  },
  "student-plus": {
    "classes-owned": 1,
    "class-members": 30,
    "study-activities": 400,
    "resource-lists": 75,
    "learning-goals": 150,
    canvases: 40,
  },
  "student-pro": {
    "classes-owned": 1,
    "class-members": 30,
    "study-activities": 1500,
    "resource-lists": 300,
    "learning-goals": 500,
    canvases: 150,
  },
  "teacher-plus": {
    "classes-owned": 8,
    "class-members": 150,
    "study-activities": 250,
    "resource-lists": 50,
    "learning-goals": 100,
    canvases: 30,
  },
  "teacher-pro": {
    "classes-owned": 25,
    "class-members": 400,
    "study-activities": 1000,
    "resource-lists": 200,
    "learning-goals": 400,
    canvases: 100,
  },
  // The school licence: one seat's allowances, deliberately at or above every
  // other tier on every column so no licensed teacher or student loses
  // anything against the plan they might otherwise buy — and still finite.
  institutional: {
    "classes-owned": 50,
    "class-members": 500,
    "study-activities": 2500,
    "resource-lists": 500,
    "learning-goals": 800,
    canvases: 250,
  },
};

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
  [PLAN_STUDENT_PLUS]: "student-plus",
  [PLAN_STUDENT_PRO]: "student-pro",
  [PLAN_TEACHER_PLUS]: "teacher-plus",
  [PLAN_TEACHER_PRO]: "teacher-pro",
  [PLAN_INSTITUTIONAL]: "institutional",
};

/**
 * Normalise a stored plan value into the tier that actually applies to this
 * account right now.
 *
 * Roles do not mix: a role-specific plan grants nothing while the account's
 * role does not match it. The stored plan is left untouched — it is billing
 * truth — so the benefits come back the moment the role matches again (roles
 * are self-service, so a student who switches to teacher and back must not
 * permanently lose a student plan they are still paying for).
 */
export function normalizePlan(
  plan: string | null,
  expiresAt: string | null,
  accountRole: string | null = null,
): SubscriptionTier {
  if (!expiryIsActive(expiresAt)) return PLAN_FREE;
  const tier = plan ? STORED_PLAN_TO_TIER[plan] : undefined;
  if (!tier) return PLAN_FREE;
  const requiredRole = planRoleRequirement(tier);
  if (requiredRole && accountRole !== requiredRole) return PLAN_FREE;
  return tier;
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
      // The explainable seating planner is a classroom feature and lives on
      // the Pro level of the plans a teacher can actually hold — which now
      // includes the school licence.
      "seating-planner":
        tier === PLAN_PRO ||
        tier === PLAN_TEACHER_PRO ||
        tier === PLAN_INSTITUTIONAL,
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
 * The upgrade ladder for an account role: the plans this account may actually
 * buy, cheapest first. Role-specific plans are preferred; the generic ladder
 * is the fallback for accounts with no role match (and for admins, who never
 * see an upsell anyway).
 */
export function upgradeLadderFor(accountRole: string | null): SubscriptionTier[] {
  if (accountRole === "student") return [PLAN_STUDENT_PLUS, PLAN_STUDENT_PRO];
  if (accountRole === "teacher") return [PLAN_TEACHER_PLUS, PLAN_TEACHER_PRO];
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
 * Map a RevenueCat event's entitlement identifiers to the plan to store.
 * When several are active, the strongest wins: the school licence first (it
 * exceeds everything), then role-specific Pro plans (the most specialised
 * product actually bought), then generic Pro (and legacy premium), then the
 * Plus level the same way.
 */
export function planForEntitlementIds(ids: string[]): string | null {
  const active = new Set(ids);
  if (active.has(INSTITUTIONAL_ENTITLEMENT)) return PLAN_INSTITUTIONAL;
  if (active.has(TEACHER_PRO_ENTITLEMENT)) return PLAN_TEACHER_PRO;
  if (active.has(STUDENT_PRO_ENTITLEMENT)) return PLAN_STUDENT_PRO;
  if (active.has(PRO_ENTITLEMENT) || active.has(PREMIUM_ENTITLEMENT)) {
    return PLAN_PRO;
  }
  if (active.has(TEACHER_PLUS_ENTITLEMENT)) return PLAN_TEACHER_PLUS;
  if (active.has(STUDENT_PLUS_ENTITLEMENT)) return PLAN_STUDENT_PLUS;
  if (active.has(PLUS_ENTITLEMENT)) return PLAN_PLUS;
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
      plan: usersTable.plan,
      expiresAt: usersTable.planExpiresAt,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const accountRole = row?.role ?? null;
  return {
    entitlements: entitlementsForPlan(
      row?.plan ?? null,
      row?.expiresAt ?? null,
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
