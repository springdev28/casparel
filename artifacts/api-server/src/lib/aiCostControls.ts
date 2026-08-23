/**
 * @fileOverview Backend domain role: centralizes Ai Cost Controls logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { RequestHandler } from "express";
import { pool } from "@workspace/db";
import { buildRateLimitStore } from "./rateLimitStore";
import { isAdminRequest } from "./adminAccess";
import { decodeToken } from "./auth";
import { isPremiumAccount } from "./entitlements";
import type { Request } from "express";

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Admins and premium accounts are exempt from the per-user AI search cap. */
async function skipPrivilegedRequest(req: Request): Promise<boolean> {
  if (isAdminRequest(req)) return true;
  const header = req.headers.authorization;
  const payload = header?.startsWith("Bearer ")
    ? decodeToken(header.slice(7))
    : null;
  if (!payload) return false;
  try {
    return await isPremiumAccount(payload.userId);
  } catch {
    return false;
  }
}

export const requireAiSearchEnabled: RequestHandler = (_req, res, next) => {
  if (process.env.AI_SEARCH_ENABLED === "false") {
    res.status(503).json({ error: "AI search is currently disabled." });
    return;
  }
  next();
};

export const aiSearchDailyUserLimiter = rateLimit({
  skip: skipPrivilegedRequest,
  keyGenerator: (req) => {
    const header = req.headers.authorization;
    const payload = header?.startsWith("Bearer ")
      ? decodeToken(header.slice(7))
      : null;
    return payload
      ? "user:" + payload.userId
      : ipKeyGenerator(req.ip ?? "unknown");
  },
  requestPropertyName: "aiSearchDailyUserRateLimit",
  validate: { singleCount: false },
  windowMs: 24 * 60 * 60 * 1000,
  max: positiveLimit(process.env.AI_SEARCH_DAILY_USER_LIMIT, 3),
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("ai-search-user-day"),
  handler(req, res, _next, options) {
    const reset = (
      req as unknown as { aiSearchDailyUserRateLimit?: { resetTime?: Date } }
    ).aiSearchDailyUserRateLimit?.resetTime;
    const retryAfter = reset
      ? Math.ceil((reset.getTime() - Date.now()) / 1000)
      : Math.ceil(options.windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res
      .status(429)
      .json({ error: "Daily AI search limit reached.", retryAfter });
  },
});

export const aiSearchDailyBudget = rateLimit({
  skip: isAdminRequest,
  requestPropertyName: "aiSearchDailyRateLimit",
  validate: { singleCount: false },
  windowMs: 24 * 60 * 60 * 1000,
  max: positiveLimit(process.env.AI_SEARCH_DAILY_LIMIT, 100),
  keyGenerator: () => "all-ai-searches",
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("ai-search-daily"),
  handler(req, res, _next, options) {
    const reset = (
      req as unknown as { aiSearchDailyRateLimit?: { resetTime?: Date } }
    ).aiSearchDailyRateLimit?.resetTime;
    const retryAfter = reset
      ? Math.ceil((reset.getTime() - Date.now()) / 1000)
      : Math.ceil(options.windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res
      .status(429)
      .json({ error: "Daily AI search budget reached.", retryAfter });
  },
});

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
  const tasks = [
    consumeAiQuota("usage-total", feature, tenYears, 2_000_000_000),
    consumeAiQuota("usage-month", feature, month, 2_000_000_000),
  ];
  if (userId !== null) {
    tasks.push(
      consumeAiQuota(
        "usage-user-total",
        String(userId) + ":" + feature,
        tenYears,
        2_000_000_000,
      ),
    );
  }
  try {
    await Promise.all(tasks);
  } catch (error) {
    // Usage telemetry must never turn a successful AI response into a 502.
    console.error("Could not record AI usage", error);
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
