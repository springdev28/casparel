/**
 * @fileOverview Backend domain role: centralizes Revenuecat logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import {
  PLAN_FREE,
  PLAN_PLUS,
  PLAN_PRO,
  PLUS_ENTITLEMENT,
  PREMIUM_ENTITLEMENT,
  PRO_ENTITLEMENT,
} from "./entitlements";

const REVENUECAT_API_BASE_URL = "https://api.revenuecat.com/v1";
const REVENUECAT_REQUEST_TIMEOUT_MS = 8_000;

type RevenueCatEntitlement = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
};

type RevenueCatCustomerInfo = {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>;
  };
};

export type RevenueCatPlan = {
  plan: typeof PLAN_FREE | typeof PLAN_PLUS | typeof PLAN_PRO;
  planExpiresAt: string | null;
};

function activeExpiry(
  entitlement: RevenueCatEntitlement,
  nowMs: number,
): string | null | undefined {
  // RevenueCat uses null for a lifetime entitlement and may extend access via a
  // grace period. `undefined` means inactive/missing; keeping it distinct from
  // null prevents a lifetime purchase from being mistaken for no entitlement.
  if (entitlement.expires_date === null) return null;
  const expiryCandidates = [
    entitlement.expires_date,
    entitlement.grace_period_expires_date,
  ];
  let latest: { value: string; time: number } | null = null;

  for (const value of expiryCandidates) {
    if (typeof value !== "string") continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > nowMs && (!latest || time > latest.time)) {
      latest = { value: new Date(time).toISOString(), time };
    }
  }

  return latest?.value;
}

/** Derive the server plan only from currently active RevenueCat entitlements. */
export function revenueCatPlanFromCustomerInfo(
  customerInfo: RevenueCatCustomerInfo,
  nowMs = Date.now(),
): RevenueCatPlan {
  const entitlements = customerInfo.subscriber?.entitlements;
  if (!entitlements || typeof entitlements !== "object") {
    throw new Error("RevenueCat Customer Info did not include entitlements");
  }

  const candidates = [
    { id: PRO_ENTITLEMENT, plan: PLAN_PRO, rank: 2 },
    { id: PREMIUM_ENTITLEMENT, plan: PLAN_PRO, rank: 2 },
    { id: PLUS_ENTITLEMENT, plan: PLAN_PLUS, rank: 1 },
  ] as const;
  // An account can temporarily report overlapping products during upgrades or
  // restore/transfer reconciliation. Selecting the highest active entitlement
  // prevents an older Plus record from downgrading an active Pro user.
  const active = candidates
    .map((candidate) => ({
      ...candidate,
      expiresAt: entitlements[candidate.id]
        ? activeExpiry(entitlements[candidate.id], nowMs)
        : undefined,
    }))
    .filter((candidate) => candidate.expiresAt !== undefined)
    .sort((a, b) => b.rank - a.rank);

  const selected = active[0];
  if (!selected) return { plan: PLAN_FREE, planExpiresAt: null };

  return {
    plan: selected.plan,
    planExpiresAt: selected.expiresAt as string | null,
  };
}

export async function fetchRevenueCatPlan(
  appUserId: string,
): Promise<RevenueCatPlan> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("REVENUECAT_SECRET_API_KEY is not configured");
  }

  const controller = new AbortController();
  // Webhook reconciliation must retry when RevenueCat is unavailable; bounding
  // this request keeps the webhook worker from hanging indefinitely without
  // fabricating a free/paid answer.
  const timeout = setTimeout(() => controller.abort(), REVENUECAT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${REVENUECAT_API_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`RevenueCat Customer Info request failed (${response.status})`);
    }
    return revenueCatPlanFromCustomerInfo(
      (await response.json()) as RevenueCatCustomerInfo,
    );
  } finally {
    clearTimeout(timeout);
  }
}
