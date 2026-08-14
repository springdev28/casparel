import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSchemaHealth } from "../lib/schemaHealth";

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
  });
});

export default router;
