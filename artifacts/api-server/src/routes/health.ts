import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSchemaHealth } from "../lib/schemaHealth";
import { aiHealth } from "../lib/aiHealth";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const schema = getSchemaHealth();
  // Keep the documented `status` field exactly as the contract declares it, and
  // report schema state alongside. A failed migration leaves the server able to
  // answer requests while parts of the app are broken, so "ok" alone is
  // misleading, surface it here rather than only in the startup logs.
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.status(schema.state === "failed" ? 503 : 200).json({
    ...data,
    schema: {
      state: schema.state,
      checkedAt: schema.checkedAt,
      // The message names the missing relation/column, which is the fastest
      // route to a diagnosis. It is not sensitive, but it is only included
      // when something is actually wrong.
      ...(schema.state === "failed" ? { error: schema.error } : {}),
    },
    // Deep research broke in production and the only signal was a screenshot
    // from a user. This reports the outcome of the AI calls the product
    // already makes -- no probe, no cost -- so a wrong key or an unreachable
    // provider is visible here instead of only in a log nobody is tailing.
    // It never changes the status code: the catalog, classes, schedules and
    // the quick source check all work without AI, and taking the server out
    // of rotation for an optional feature would turn a degraded product into
    // no product.
    ai: aiHealth(),
  });
});

export default router;
