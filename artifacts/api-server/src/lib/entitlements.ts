import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/** The RevenueCat entitlement identifier that unlocks premium features. */
export const PREMIUM_ENTITLEMENT = "premium";

export const PLAN_FREE = "free";
export const PLAN_PREMIUM = "premium";

/**
 * True when the account currently holds an active premium entitlement.
 * Premium is active while `plan === "premium"` and, if an expiry is recorded,
 * that expiry is in the future. Admins are unlimited via a separate path.
 */
export async function isPremiumAccount(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ plan: usersTable.plan, expiresAt: usersTable.planExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return isPlanActive(row?.plan ?? null, row?.expiresAt ?? null);
}

/** Pure predicate for a plan value + optional expiry timestamp. */
export function isPlanActive(
  plan: string | null,
  expiresAt: string | null,
): boolean {
  if (plan !== PLAN_PREMIUM) return false;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return false;
  return true;
}
