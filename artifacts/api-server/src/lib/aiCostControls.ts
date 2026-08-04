import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { RequestHandler } from "express";
import { pool } from "@workspace/db";
import { buildRateLimitStore } from "./rateLimitStore";
import { isAdminRequest } from "./adminAccess";
import { decodeToken } from "./auth";

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const requireAiSearchEnabled: RequestHandler = (_req, res, next) => {
  if (process.env.AI_SEARCH_ENABLED === "false") {
    res.status(503).json({ error: "AI search is currently disabled." });
    return;
  }
  next();
};

export const aiSearchHourlyLimiter = rateLimit({
  skip: isAdminRequest,
  keyGenerator: (req) => {
    const header = req.headers.authorization;
    const payload = header?.startsWith("Bearer ") ? decodeToken(header.slice(7)) : null;
    return payload ? "user:" + payload.userId : ipKeyGenerator(req.ip ?? "unknown");
  },
  requestPropertyName: "aiSearchHourlyRateLimit",
  validate: { singleCount: false },
  windowMs: 60 * 60 * 1000,
  max: positiveLimit(process.env.AI_SEARCH_HOURLY_LIMIT, 20),
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("ai-search-hourly"),
  handler(req, res, _next, options) {
    const reset = (
      req as unknown as { aiSearchHourlyRateLimit?: { resetTime?: Date } }
    ).aiSearchHourlyRateLimit?.resetTime;
    const retryAfter = reset
      ? Math.ceil((reset.getTime() - Date.now()) / 1000)
      : Math.ceil(options.windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res
      .status(429)
      .json({ error: "Hourly AI search limit reached.", retryAfter });
  },
});

export const aiSearchDailyBudget = rateLimit({
  skip: isAdminRequest,
  requestPropertyName: "aiSearchDailyRateLimit",
  validate: { singleCount: false },
  windowMs: 24 * 60 * 60 * 1000,
  max: positiveLimit(process.env.AI_SEARCH_DAILY_LIMIT, 50),
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
