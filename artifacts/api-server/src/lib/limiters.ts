import rateLimit from "express-rate-limit";
import { buildRateLimitStore } from "./rateLimitStore";

/**
 * Global API limiter — 100 requests per minute per IP.
 * Applied to every /api route.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("global"),
  handler(req, res, _next, options) {
    const reset = (req as unknown as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const retryAfter = reset
      ? Math.ceil((reset.getTime() - Date.now()) / 1000)
      : Math.ceil(options.windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "Too many requests. Please slow down.", retryAfter });
  },
});

/**
 * Content-creation limiter — 20 requests per minute per IP.
 * Applied to POST /resources and POST /reviews to slow automated content spam.
 */
export const contentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("content"),
  handler(req, res, _next, options) {
    const reset = (req as unknown as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const retryAfter = reset
      ? Math.ceil((reset.getTime() - Date.now()) / 1000)
      : Math.ceil(options.windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({
      error: "You're submitting too quickly. Please wait before trying again.",
      retryAfter,
    });
  },
});
