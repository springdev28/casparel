import { Router, type IRouter } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { PLAN_INSTITUTIONAL } from "../lib/entitlements";
import { fetchSubscriberPlan } from "../lib/revenuecat";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post(
  "/users/me/entitlements/reconcile",
  requireAuth,
  contentLimiter,
  async (req, res) => {
    const apiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
    if (!apiKey) {
      res
        .status(503)
        .json({ error: "Purchase verification is not configured" });
      return;
    }
    const { userId } = req as AuthenticatedRequest;
    try {
      // Account identity and entitlement come from trusted sources, never the request body.
      const plan = await fetchSubscriberPlan(userId, apiKey);
      await db
        .update(usersTable)
        .set(plan)
        .where(
          and(
            eq(usersTable.id, userId),
            ne(usersTable.plan, PLAN_INSTITUTIONAL),
          ),
        );
      res.json({ reconciled: true });
    } catch (error) {
      logger.warn({ err: error, userId }, "Purchase verification failed");
      res
        .status(502)
        .json({ error: "Purchase verification temporarily unavailable" });
    }
  },
);

export default router;
