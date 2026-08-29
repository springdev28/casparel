/**
 * @fileOverview API role: implements the Webhooks HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, usersTable, webhookEventsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  KNOWN_ENTITLEMENTS,
  PLAN_FREE,
  PLAN_INSTITUTIONAL,
  PLAN_PRO,
  planForEntitlementIds,
} from "../lib/entitlements";

const router: IRouter = Router();

const REVENUECAT = "revenuecat";

/** Event types that grant or refresh a self-serve subscription. */
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
  /** TRANSFER only: the aliases losing the subscription. */
  transferred_from?: string[] | null;
  /** TRANSFER only: the aliases receiving it. */
  transferred_to?: string[] | null;
}

/** App user ids RevenueCat sends are our user ids, as strings. */
function accountIds(aliases: string[] | null | undefined): number[] {
  const ids = (aliases ?? [])
    .map((alias) => Number(alias))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)];
}

/**
 * Claim an event id, returning false if it was already handled.
 *
 * Claimed before the plan is written, not after: two deliveries of the same
 * event can be in flight at once, and the primary key is what makes only one
 * of them proceed. A claim that is not followed by a successful write is
 * released again so the provider's retry is not swallowed.
 */
async function claimEvent(eventId: string, eventType: string) {
  const claimed = await db
    .insert(webhookEventsTable)
    .values({ provider: REVENUECAT, eventId, eventType })
    .onConflictDoNothing()
    .returning({ eventId: webhookEventsTable.eventId });
  return claimed.length > 0;
}

async function releaseEvent(eventId: string) {
  await db
    .delete(webhookEventsTable)
    .where(
      and(
        eq(webhookEventsTable.provider, REVENUECAT),
        eq(webhookEventsTable.eventId, eventId),
      ),
    );
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

  // TRANSFER carries no app_user_id: it names the aliases on either side of
  // the move instead, so it is handled before the app_user_id check that
  // every other event needs. It used to fall through that check and be
  // dropped, which left a transferred subscription entitled on the account
  // that gave it up and unentitled on the one that received it.
  if (event.type === "TRANSFER") {
    await reconcileTransfer(event, res);
    return;
  }

  const userId = Number(event.app_user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    // Anonymous or non-numeric app user id, nothing to reconcile.
    res.status(200).json({ received: true });
    return;
  }

  const entitlementIds = [
    ...(event.entitlement_ids ?? []),
    ...(event.entitlement_id ? [event.entitlement_id] : []),
  ];
  const touchesSubscription =
    entitlementIds.length === 0 ||
    entitlementIds.some((id) => KNOWN_ENTITLEMENTS.has(id));
  // Historical entitlement identifiers collapse to Plus or Pro. Account role
  // never changes what was bought.
  const grantedPlan =
    planForEntitlementIds(entitlementIds) ??
    (entitlementIds.length === 0 ? PLAN_PRO : null);

  const changesPlan =
    (GRANT_EVENTS.has(event.type) && touchesSubscription && grantedPlan) ||
    (REVOKE_EVENTS.has(event.type) && touchesSubscription);
  // Other event types (CANCELLATION, BILLING_ISSUE, TEST, …) keep the current
  // plan — cancellation stays entitled until EXPIRATION arrives — so they
  // never need a claim and never consume one.
  if (!changesPlan) {
    res.status(200).json({ received: true });
    return;
  }

  const claim = await claimEventOrAck(event, res);
  if (!claim.proceed) return;

  try {
    if (GRANT_EVENTS.has(event.type) && grantedPlan) {
      const expiresAt =
        typeof event.expiration_at_ms === "number" && event.expiration_at_ms > 0
          ? new Date(event.expiration_at_ms).toISOString()
          : null;
      await db
        .update(usersTable)
        .set({ plan: grantedPlan, planExpiresAt: expiresAt })
        .where(
          and(
            eq(usersTable.id, userId),
            ne(usersTable.plan, PLAN_INSTITUTIONAL),
          ),
        );
    } else {
      await db
        .update(usersTable)
        .set({ plan: PLAN_FREE, planExpiresAt: null })
        .where(
          and(
            eq(usersTable.id, userId),
            ne(usersTable.plan, PLAN_INSTITUTIONAL),
          ),
        );
    }
  } catch (error) {
    logger.error({ err: error }, "RevenueCat webhook: failed to reconcile plan");
    await releaseClaim(claim.eventId);
    res.status(500).json({ error: "Reconciliation failed" });
    return;
  }

  res.status(200).json({ received: true });
});

/**
 * Decide whether this delivery should be applied.
 *
 * An event with no id cannot be de-duplicated, so it is applied as before —
 * refusing it would drop a real entitlement change over a missing field.
 * Everything else is claimed once; a repeat delivery is acknowledged without
 * touching the account.
 */
async function claimEventOrAck(
  event: RevenueCatEvent,
  res: Response,
): Promise<{ proceed: boolean; eventId: string | null }> {
  const eventId = typeof event.id === "string" && event.id ? event.id : null;
  if (!eventId) return { proceed: true, eventId: null };
  let claimed: boolean;
  try {
    claimed = await claimEvent(eventId, event.type ?? "UNKNOWN");
  } catch (error) {
    logger.error(
      { err: error },
      "RevenueCat webhook: failed to record event, retry expected",
    );
    res.status(500).json({ error: "Reconciliation failed" });
    return { proceed: false, eventId: null };
  }
  if (!claimed) {
    res.status(200).json({ received: true, duplicate: true });
    return { proceed: false, eventId: null };
  }
  return { proceed: true, eventId };
}

async function releaseClaim(eventId: string | null) {
  if (!eventId) return;
  try {
    await releaseEvent(eventId);
  } catch (error) {
    // The claim outliving a failed write means the retry is ignored. Say so:
    // the entitlement has to be fixed by hand from here.
    logger.error(
      { err: error, eventId },
      "RevenueCat webhook: could not release event claim after a failed write",
    );
  }
}

/**
 * Move a subscription between accounts.
 *
 * RevenueCat sends the aliases, not the entitlement, so the honest
 * reconciliation is to move what this server already believes: the plan and
 * expiry the source accounts hold become the destination's, and the source
 * accounts drop to free. Anything more — asking RevenueCat what the
 * destination is entitled to — needs an API key this server does not have,
 * and guessing Pro would hand out an entitlement nobody bought.
 */
async function reconcileTransfer(
  event: RevenueCatEvent,
  res: Response,
): Promise<void> {
  const from = accountIds(event.transferred_from);
  const to = accountIds(event.transferred_to);
  if (from.length === 0 || to.length === 0) {
    // Anonymous aliases on either side: nothing here maps to an account.
    res.status(200).json({ received: true });
    return;
  }

  const claim = await claimEventOrAck(event, res);
  if (!claim.proceed) return;

  try {
    const sources = await db
      .select({
        id: usersTable.id,
        plan: usersTable.plan,
        planExpiresAt: usersTable.planExpiresAt,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, from));
    // The paid one, if the source side holds several accounts.
    const paid = sources.find(
      (source) =>
        source.plan &&
        source.plan !== PLAN_FREE &&
        source.plan !== PLAN_INSTITUTIONAL,
    );
    if (!paid) {
      logger.info(
        { from, to },
        "RevenueCat webhook: transfer from accounts with no stored plan",
      );
      res.status(200).json({ received: true });
      return;
    }

    await db
      .update(usersTable)
      .set({ plan: paid.plan, planExpiresAt: paid.planExpiresAt })
      .where(
        and(
          inArray(usersTable.id, to),
          ne(usersTable.plan, PLAN_INSTITUTIONAL),
        ),
      );
    // Revoked after the grant, and only from accounts that are not also on
    // the receiving side: a transfer between aliases of one account would
    // otherwise end with that account on the free plan.
    const institutionalSourceIds = new Set(
      sources
        .filter((source) => source.plan === PLAN_INSTITUTIONAL)
        .map((source) => source.id),
    );
    const losing = from.filter(
      (id) => !to.includes(id) && !institutionalSourceIds.has(id),
    );
    if (losing.length)
      await db
        .update(usersTable)
        .set({ plan: PLAN_FREE, planExpiresAt: null })
        .where(inArray(usersTable.id, losing));
  } catch (error) {
    logger.error(
      { err: error },
      "RevenueCat webhook: failed to reconcile transfer",
    );
    await releaseClaim(claim.eventId);
    res.status(500).json({ error: "Reconciliation failed" });
    return;
  }

  res.status(200).json({ received: true });
}

export default router;
