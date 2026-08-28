/**
 * @fileOverview Backend domain role: centralizes Ai Cost Controls logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import type { RequestHandler } from "express";
import { pool } from "@workspace/db";
import { resolveAccountPlan } from "./entitlements";

export const requireAiSearchEnabled: RequestHandler = (_req, res, next) => {
  if (process.env.AI_SEARCH_ENABLED === "false") {
    res.status(503).json({ error: "AI search is currently disabled." });
    return;
  }
  next();
};

export function paidRetryAllowed() {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.AI_SEARCH_ALLOW_RETRY === "true"
  );
}

export type AiUsageFeature =
  "search" | "quick-review" | "deep-research" | "metadata";

export async function recordAiUsage(
  feature: AiUsageFeature,
  userId: number | null,
) {
  if (process.env.NODE_ENV === "test") return;
  const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;
  const month = 30 * 24 * 60 * 60 * 1000;
  try {
    const tasks = [
      consumeAiQuota("usage-total", feature, tenYears, 2_000_000_000),
      consumeAiQuota("usage-month", feature, month, 2_000_000_000),
    ];
    if (userId !== null) {
      const tier = (await resolveAccountPlan(userId)).entitlements.tier;
      tasks.push(
        consumeAiQuota("usage-user-total", `${userId}:${feature}`, tenYears, 2_000_000_000),
        consumeAiQuota("usage-user-month", `${userId}:${feature}`, month, 2_000_000_000),
        consumeAiQuota("usage-plan-month", `${tier}:${feature}`, month, 2_000_000_000),
      );
    }
    await Promise.all(tasks);
  } catch (error) {
    // Usage telemetry must never turn a successful AI response into a 502.
    console.error("Could not record AI usage", error);
  }
}

/** A provider call avoided by a fresh shared cache hit. */
export async function recordAiCache(
  feature: Extract<AiUsageFeature, "search" | "deep-research">,
  userId: number | null,
) {
  if (process.env.NODE_ENV === "test") return;
  const month = 30 * 24 * 60 * 60 * 1000;
  try {
    const tasks = [
      consumeAiQuota("cache-month", feature, month, 2_000_000_000),
    ];
    if (userId !== null) {
      tasks.push(
        consumeAiQuota("cache-user-month", `${userId}:${feature}`, month, 2_000_000_000),
      );
    }
    await Promise.all(tasks);
  } catch (error) {
    console.error("Could not record AI cache hit", error);
  }
}

export async function consumeAiQuota(
  prefix: string,
  key: string,
  windowMs: number,
  max: number,
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const scopedKey = `${prefix}:${key}`;
  const result = await pool.query<{ hits: number; reset_time: Date }>(
    `INSERT INTO rate_limit_hits (key, hits, reset_time)
     VALUES ($1, 1, NOW() + ($2 || ' milliseconds')::interval)
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limit_hits.reset_time <= NOW() THEN 1 ELSE rate_limit_hits.hits + 1 END,
       reset_time = CASE WHEN rate_limit_hits.reset_time <= NOW()
         THEN NOW() + ($2 || ' milliseconds')::interval ELSE rate_limit_hits.reset_time END
     RETURNING hits, reset_time`,
    [scopedKey, String(windowMs)],
  );
  const row = result.rows[0];
  return {
    allowed: row.hits <= max,
    remaining: Math.max(0, max - row.hits),
    retryAfter: Math.max(
      1,
      Math.ceil((row.reset_time.getTime() - Date.now()) / 1000),
    ),
  };
}
