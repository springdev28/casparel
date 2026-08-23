/**
 * @fileOverview API role: implements the Webhooks HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  revenuecatWebhookEventsTable,
  usersTable,
} from "@workspace/db";
import {
  PLAN_FREE,
  PLAN_PLUS,
  PLAN_PRO,
  PLUS_ENTITLEMENT,
  PRO_ENTITLEMENT,
  PREMIUM_ENTITLEMENT,
} from "../lib/entitlements";
import {
  fetchRevenueCatPlan,
  type RevenueCatPlan,
} from "../lib/revenuecat";
import { recordWorkflowEvent } from "../lib/workflowAnalytics";

const router: IRouter = Router();

/** Event types that grant/refresh the premium entitlement. */
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

/** Event types that revoke the entitlement outright. */
const REVOKE_EVENTS = new Set(["EXPIRATION"]);

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

type AccountPlanUpdate = RevenueCatPlan & { userId: number };

function numericUserId(appUserId: string | undefined): number | null {
  if (!appUserId || !/^[1-9]\d*$/.test(appUserId)) return null;
  const value = Number(appUserId);
  return Number.isSafeInteger(value) ? value : null;
}

function uniqueNumericAliases(event: RevenueCatEvent) {
  const aliases = [
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ];
  const result = new Map<number, string>();
  for (const alias of aliases) {
    const userId = numericUserId(alias);
    if (userId !== null) result.set(userId, alias);
  }
  return result;
}

async function planUpdatesForEvent(
  event: RevenueCatEvent,
  touchesSubscription: boolean,
  grantedPlan: typeof PLAN_PLUS | typeof PLAN_PRO,
): Promise<AccountPlanUpdate[]> {
  if (event.type === "TRANSFER") {
    return Promise.all(
      [...uniqueNumericAliases(event)].map(async ([userId, alias]) => ({
        userId,
        ...(await fetchRevenueCatPlan(alias)),
      })),
    );
  }

  const userId = numericUserId(event.app_user_id);
  if (userId === null || !touchesSubscription) return [];
  if (GRANT_EVENTS.has(event.type ?? "")) {
    const expiresAt =
      typeof event.expiration_at_ms === "number" && event.expiration_at_ms > 0
        ? new Date(event.expiration_at_ms).toISOString()
        : null;
    return [{ userId, plan: grantedPlan, planExpiresAt: expiresAt }];
  }
  if (REVOKE_EVENTS.has(event.type ?? "")) {
    return [{ userId, plan: PLAN_FREE, planExpiresAt: null }];
  }
  return [];
}

/**
 * POST /webhooks/revenuecat
 *
 * Inbound RevenueCat webhook (server-to-server). Authenticated by a shared
 * secret sent in the Authorization header, configured both here and in the
 * RevenueCat dashboard as `REVENUECAT_WEBHOOK_AUTH`. Reconciles the account's
 * `plan` so entitlement enforcement (AI limits) is authoritative server-side.
 *
 * This is not part of the client OpenAPI surface, it is never called by the
 * app, so it is intentionally not in `lib/api-spec/openapi.yaml`.
 */
router.post("/webhooks/revenuecat", async (req, res): Promise<void> => {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    // Refuse to process unauthenticated entitlement writes.
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }
  const provided = req.headers.authorization ?? "";
  if (!timingSafeEqualStr(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const event = (req.body as { event?: RevenueCatEvent })?.event;
  if (!event || typeof event.type !== "string") {
    // Malformed but authenticated, ack so RevenueCat does not retry forever.
    res.status(200).json({ received: true });
    return;
  }

  const eventId = typeof event.id === "string" ? event.id.trim() : "";
  if (!eventId || eventId.length > 255) {
    // Never make a non-idempotent entitlement write. Authenticated malformed
    // events are acknowledged so a permanently invalid payload is not retried.
    res.status(200).json({ received: true });
    return;
  }

  const entitlementIds = [
    ...(event.entitlement_ids ?? []),
    ...(event.entitlement_id ? [event.entitlement_id] : []),
  ];
  const knownEntitlements = new Set([
    PLUS_ENTITLEMENT,
    PRO_ENTITLEMENT,
    PREMIUM_ENTITLEMENT,
  ]);
  const touchesSubscription =
    entitlementIds.length === 0 ||
    entitlementIds.some((id) => knownEntitlements.has(id));
  const grantedPlan =
    entitlementIds.length === 0 ||
    entitlementIds.includes(PRO_ENTITLEMENT) ||
    entitlementIds.includes(PREMIUM_ENTITLEMENT)
      ? PLAN_PRO
      : PLAN_PLUS;

  try {
    // TRANSFER payloads describe the direction of the move but not the final
    // entitlement state. Fetch both sides before opening the transaction. If
    // RevenueCat is unavailable, no receipt is written and their retry remains
    // able to reconcile the event later.
    const updates = await planUpdatesForEvent(
      event,
      touchesSubscription,
      grantedPlan,
    );
    const applied = await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(revenuecatWebhookEventsTable)
        .values({ eventId, eventType: event.type! })
        .onConflictDoNothing()
        .returning({ eventId: revenuecatWebhookEventsTable.eventId });
      if (!receipt) return false;

      for (const update of updates) {
        await tx
          .update(usersTable)
          .set({
            plan: update.plan,
            planExpiresAt: update.planExpiresAt,
          })
          .where(eq(usersTable.id, update.userId));
      }
      return true;
    });

    const userId = numericUserId(event.app_user_id);
    if (
      applied &&
      userId !== null &&
      (event.type === "INITIAL_PURCHASE" ||
        event.type === "NON_RENEWING_PURCHASE")
    ) {
      await recordWorkflowEvent({
        userId,
        event: "purchase_completed",
        context: { plan: grantedPlan, provider: "revenuecat" },
      });
    }
    // Other event types keep the current plan. Cancellations remain entitled
    // until EXPIRATION; every well-formed event id is still durably acknowledged.
    res.status(200).json({ received: true, duplicate: !applied });
  } catch (error) {
    console.error("RevenueCat webhook: failed to reconcile plan", error);
    res.status(500).json({ error: "Reconciliation failed" });
  }
});

export default router;
