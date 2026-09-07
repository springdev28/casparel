import { z } from "zod/v4";
import {
  PLAN_FREE,
  PLAN_INSTITUTIONAL,
  planForEntitlementIds,
} from "./entitlements";

const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const subscriberResponse = z.object({
  subscriber: z.object({
    entitlements: z.record(
      z.string(),
      z.object({
        expires_date: date.nullable(),
        grace_period_expires_date: date.nullable().optional(),
      }),
    ),
  }),
});

/** Resolve only verified, unexpired self-serve entitlements. Never sell a school licence. */
export function planFromSubscriber(payload: unknown, now = Date.now()) {
  const { subscriber } = subscriberResponse.parse(payload);
  const active = Object.entries(subscriber.entitlements).flatMap(
    ([id, entitlement]) => {
      const plan = planForEntitlementIds([id]);
      if (!plan || plan === PLAN_INSTITUTIONAL) return [];
      const expiresAt =
        entitlement.expires_date === null
          ? null
          : Math.max(
              Date.parse(entitlement.expires_date),
              entitlement.grace_period_expires_date
                ? Date.parse(entitlement.grace_period_expires_date)
                : 0,
            );
      return expiresAt === null || expiresAt > now
        ? [{ id, plan, expiresAt }]
        : [];
    },
  );
  const plan = planForEntitlementIds(active.map(({ id }) => id)) ?? PLAN_FREE;
  const matching = active.filter((entry) => entry.plan === plan);
  const expiresAt = matching.some((entry) => entry.expiresAt === null)
    ? null
    : Math.max(0, ...matching.map((entry) => entry.expiresAt ?? 0));
  return {
    plan,
    planExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
}

export async function fetchSubscriberPlan(userId: number, apiKey: string) {
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${userId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    throw new Error(`RevenueCat verification returned ${response.status}`);
  return planFromSubscriber(await response.json());
}
