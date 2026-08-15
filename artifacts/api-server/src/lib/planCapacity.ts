/**
 * Plan capacity, the half of the subscription model that is about stored data
 * rather than AI calls.
 *
 * Every check answers one question: if this account adds N more rows of this
 * kind, does it stay inside the plan it pays for? Counts are read at the moment
 * of the write, so a downgrade takes effect on the next creation attempt
 * without a background job needing to reconcile anything. Existing rows are
 * never deleted or hidden when a plan shrinks; the account simply cannot add
 * more until it is back under the limit. Destroying a teacher's roster because
 * a card expired would be a far worse failure than refusing the next insert.
 */
import { eq, sql } from "drizzle-orm";
import type { Response } from "express";
import {
  db,
  canvasesTable,
  classesTable,
  classMembersTable,
  learningGoalsTable,
  resourceListsTable,
  studyActivitiesTable,
} from "@workspace/db";
import {
  capacityLimitFor,
  resolveAccountPlan,
  TIER_LABELS,
  upgradeTargetFor,
  type PlanCapacity,
  type SubscriptionTier,
} from "./entitlements";

/** Human wording for each capacity, used in the 402 body the client shows. */
const CAPACITY_LABELS: Record<PlanCapacity, string> = {
  "classes-owned": "classes",
  "class-members": "members in a class",
  "study-activities": "study activities",
  "resource-lists": "resource lists",
  "learning-goals": "learning goals",
  canvases: "canvases",
};

export interface CapacityDecision {
  allowed: boolean;
  /** Rows the plan permits, or null when the plan sets no cap. */
  limit: number | null;
  used: number;
  /** Rows still available, or null when uncapped. */
  remaining: number | null;
  tier: SubscriptionTier;
  /** The cheapest plan on this account's ladder that would fit the rows. */
  requiredPlan: SubscriptionTier;
}

const UNCAPPED: Omit<CapacityDecision, "tier" | "used"> = {
  allowed: true,
  limit: null,
  remaining: null,
  requiredPlan: "pro",
};

async function countRows(query: Promise<{ count: number }[]>): Promise<number> {
  const [row] = await query;
  return Number(row?.count ?? 0);
}

/** Current row count for a capacity owned by one account. */
async function usedByAccount(
  userId: number,
  capacity: PlanCapacity,
): Promise<number> {
  const total = sql<number>`cast(count(*) as int)`;
  switch (capacity) {
    case "classes-owned":
      return countRows(
        db
          .select({ count: total })
          .from(classesTable)
          .where(eq(classesTable.teacherId, userId)),
      );
    case "study-activities":
      return countRows(
        db
          .select({ count: total })
          .from(studyActivitiesTable)
          .where(eq(studyActivitiesTable.ownerId, userId)),
      );
    case "resource-lists":
      return countRows(
        db
          .select({ count: total })
          .from(resourceListsTable)
          .where(eq(resourceListsTable.ownerId, userId)),
      );
    case "learning-goals":
      return countRows(
        db
          .select({ count: total })
          .from(learningGoalsTable)
          .where(eq(learningGoalsTable.userId, userId)),
      );
    case "canvases":
      return countRows(
        db
          .select({ count: total })
          .from(canvasesTable)
          .where(eq(canvasesTable.ownerId, userId)),
      );
    case "class-members":
      // Only meaningful per class; resolved by classMemberCapacity instead.
      return 0;
  }
}

/**
 * Would `additional` more rows of `capacity` fit inside this account's plan?
 * Admin accounts are uncapped — the only uncapped accounts anywhere, matching
 * how they bypass the AI quotas.
 */
export async function accountCapacity(
  userId: number,
  capacity: PlanCapacity,
  additional = 1,
): Promise<CapacityDecision> {
  const { entitlements, accountRole, isAdmin } =
    await resolveAccountPlan(userId);
  if (isAdmin) {
    return { ...UNCAPPED, tier: "pro", used: 0 };
  }
  const tier = entitlements.tier;
  const limit = capacityLimitFor(tier, capacity);
  const used = await usedByAccount(userId, capacity);
  if (limit === null) return { ...UNCAPPED, tier, used };
  return {
    allowed: used + additional <= limit,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    tier,
    requiredPlan: upgradeTargetFor(capacity, accountRole, used + additional, tier),
  };
}

/**
 * Would `additional` more members fit in this class? The limit belongs to the
 * teacher who owns the class, so a student joining a Pro teacher's class is
 * never blocked by their own free plan.
 */
export async function classMemberCapacity(
  classId: number,
  additional = 1,
): Promise<CapacityDecision> {
  const [cls] = await db
    .select({ teacherId: classesTable.teacherId })
    .from(classesTable)
    .where(eq(classesTable.id, classId));
  if (!cls) return { ...UNCAPPED, tier: "free", used: 0 };

  const { entitlements, accountRole, isAdmin } = await resolveAccountPlan(
    cls.teacherId,
  );
  if (isAdmin) return { ...UNCAPPED, tier: "pro", used: 0 };

  const tier = entitlements.tier;
  const limit = capacityLimitFor(tier, "class-members");
  const used = await countRows(
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(classMembersTable)
      .where(eq(classMembersTable.classId, classId)),
  );
  if (limit === null) return { ...UNCAPPED, tier, used };
  return {
    allowed: used + additional <= limit,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    tier,
    requiredPlan: upgradeTargetFor(
      "class-members",
      accountRole,
      used + additional,
      tier,
    ),
  };
}

/**
 * The 402 body for a refused write. It carries the numbers as data rather than
 * only prose so a client can render a meter without parsing the sentence, and
 * so the message a user sees is generated from the limit that was actually
 * applied.
 */
export function capacityErrorBody(
  capacity: PlanCapacity,
  decision: CapacityDecision,
) {
  const planName = TIER_LABELS[decision.requiredPlan];
  const tierName = TIER_LABELS[decision.tier];
  // When the account is already on the recommended plan (today that means the
  // sales-led Institutional licence, which has no self-serve step above it),
  // "upgrade to <same plan>" would be nonsense — say the honest thing instead.
  const advice =
    decision.requiredPlan === decision.tier
      ? "Contact support to extend your licence, or remove some to free up room."
      : `Upgrade to ${planName} for more, or remove some to free up room.`;
  return {
    error:
      `Casparel ${tierName} includes up to ${decision.limit} ` +
      `${CAPACITY_LABELS[capacity]}. ${advice}`,
    code: "PLAN_LIMIT_REACHED" as const,
    capacity,
    limit: decision.limit,
    used: decision.used,
    requiredPlan: decision.requiredPlan,
  };
}

/** Send the standard 402 for a capacity that is full. */
export function sendCapacityError(
  res: Response,
  capacity: PlanCapacity,
  decision: CapacityDecision,
): void {
  res.status(402).json(capacityErrorBody(capacity, decision));
}

/**
 * Guard for a route that creates account-owned rows. Returns true when the
 * write may proceed; when it returns false the 402 has already been sent.
 */
export async function ensureAccountCapacity(
  res: Response,
  userId: number,
  capacity: PlanCapacity,
  additional = 1,
): Promise<boolean> {
  const decision = await accountCapacity(userId, capacity, additional);
  if (decision.allowed) return true;
  sendCapacityError(res, capacity, decision);
  return false;
}

/** Guard for a route that adds people to a class roster. */
export async function ensureClassMemberCapacity(
  res: Response,
  classId: number,
  additional = 1,
): Promise<boolean> {
  const decision = await classMemberCapacity(classId, additional);
  if (decision.allowed) return true;
  sendCapacityError(res, "class-members", decision);
  return false;
}

/** Every account-owned capacity and its current usage, for the usage endpoint. */
export async function accountCapacityReport(
  userId: number,
): Promise<Record<PlanCapacity, { used: number; limit: number | null }>> {
  const { entitlements, isAdmin } = await resolveAccountPlan(userId);
  const effective = entitlements.tier;
  const capacities: PlanCapacity[] = [
    "classes-owned",
    "study-activities",
    "resource-lists",
    "learning-goals",
    "canvases",
  ];
  const counts = await Promise.all(
    capacities.map((capacity) => usedByAccount(userId, capacity)),
  );
  const report = {} as Record<
    PlanCapacity,
    { used: number; limit: number | null }
  >;
  capacities.forEach((capacity, index) => {
    report[capacity] = {
      used: counts[index],
      limit: isAdmin ? null : capacityLimitFor(effective, capacity),
    };
  });
  // Roster size is per class, not per account, so it is reported as the cap
  // that applies to classes this account owns rather than a usage count.
  report["class-members"] = {
    used: 0,
    limit: isAdmin ? null : capacityLimitFor(effective, "class-members"),
  };
  return report;
}
