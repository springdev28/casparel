/**
 * @fileOverview API role: reconciles store subscriptions into Casparel's server-side plan authority.
 * System connection: mounted by routes/index.ts; the mobile purchase lifecycle calls this after RevenueCat purchase or restore.
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { ReconcileMyEntitlementsResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { fetchRevenueCatPlan } from "../lib/revenuecat";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * Make RevenueCat Customer Info, rather than a client-supplied plan string,
 * the source for immediate post-purchase access. Webhooks remain the durable
 * lifecycle path for renewals, expiry, cancellation, and account transfers.
 */
router.post(
  "/users/me/entitlements/reconcile",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    try {
      const entitlement = await fetchRevenueCatPlan(String(userId));
      await db
        .update(usersTable)
        .set({
          plan: entitlement.plan,
          planExpiresAt: entitlement.planExpiresAt,
        })
        .where(eq(usersTable.id, userId));

      // Deliberately return only subscription state. Platform authority and
      // educator workspace access are separate and are never inferred here.
      res.json(ReconcileMyEntitlementsResponse.parse(entitlement));
    } catch (error) {
      console.error("RevenueCat reconciliation: unable to verify account", error);
      res.status(503).json({ error: "Unable to verify purchases right now" });
    }
  },
);

export default router;
