/**
 * @fileOverview API role: implements the Analytics HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import {
  RecordProductEventBody,
  RecordProductEventResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { recordWorkflowEvent } from "../lib/workflowAnalytics";

const router: IRouter = Router();

router.post(
  "/analytics/events",
  requireAuth,
  async (req, res): Promise<void> => {
    // Generated validation is the privacy boundary: only known event names and
    // bounded context fields reach workflowEvents; arbitrary browser logs do not.
    const parsed = RecordProductEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid product event" });
      return;
    }

    const { userId } = req as AuthenticatedRequest;
    await recordWorkflowEvent({
      userId,
      event: parsed.data.event,
      resourceId: parsed.data.resourceId,
      context: parsed.data.context,
    });
    // 202 means the product action is accepted independently of analytics
    // durability; recordWorkflowEvent intentionally absorbs storage failures.
    res
      .status(202)
      .json(RecordProductEventResponse.parse({ accepted: true }));
  },
);

export default router;
