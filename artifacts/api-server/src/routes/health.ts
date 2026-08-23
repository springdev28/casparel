/**
 * @fileOverview API role: implements the Health HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSchemaHealth } from "../lib/schemaHealth";
import { aiHealth } from "../lib/aiHealth";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const schema = getSchemaHealth();
  /*
   * The whole body is parsed, not just `status`.
   *
   * This used to validate `{ status: "ok" }` against the contract and then
   * spread two more fields onto it on the way out, so the two fields anybody
   * actually reads -- is the schema migrated, is AI working -- were the two
   * the contract had no opinion about. They are described now, and checked
   * here, which is the only way the description stays true.
   */
  const body = HealthCheckResponse.parse({
    status: "ok",
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
  res.status(schema.state === "failed" ? 503 : 200).json(body);
});

export default router;
