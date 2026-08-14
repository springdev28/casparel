import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  PLAN_FREE,
  PLAN_PREMIUM,
  PREMIUM_ENTITLEMENT,
} from "../lib/entitlements";

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
  type?: string;
  app_user_id?: string;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
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

  const userId = Number(event.app_user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    // Anonymous or non-numeric app user id, nothing to reconcile.
    res.status(200).json({ received: true });
    return;
  }

  const entitlementIds = event.entitlement_ids ?? [];
  const touchesPremium =
    entitlementIds.length === 0 ||
    entitlementIds.includes(PREMIUM_ENTITLEMENT) ||
    event.entitlement_id === PREMIUM_ENTITLEMENT;

  try {
    if (GRANT_EVENTS.has(event.type) && touchesPremium) {
      const expiresAt =
        typeof event.expiration_at_ms === "number" && event.expiration_at_ms > 0
          ? new Date(event.expiration_at_ms).toISOString()
          : null;
      await db
        .update(usersTable)
        .set({ plan: PLAN_PREMIUM, planExpiresAt: expiresAt })
        .where(eq(usersTable.id, userId));
    } else if (REVOKE_EVENTS.has(event.type) && touchesPremium) {
      await db
        .update(usersTable)
        .set({ plan: PLAN_FREE, planExpiresAt: null })
        .where(eq(usersTable.id, userId));
    }
    // Other event types (CANCELLATION, BILLING_ISSUE, TRANSFER, TEST, …) keep
    // the current plan, cancellation stays entitled until EXPIRATION arrives.
  } catch (error) {
    console.error("RevenueCat webhook: failed to reconcile plan", error);
    res.status(500).json({ error: "Reconciliation failed" });
    return;
  }

  res.status(200).json({ received: true });
});

export default router;
