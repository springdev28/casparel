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
 * Discover limiter — 5 requests per minute per IP.
 * Applied to GET /resources/discover which calls OpenAI with web_search_preview
 * on every request, making it expensive to abuse.
 */
export const discoverLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("discover"),
  handler(req, res, _next, options) {
    const reset = (req as unknown as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const retryAfter = reset
      ? Math.ceil((reset.getTime() - Date.now()) / 1000)
      : Math.ceil(options.windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({
      error: "Search limit reached. You can run up to 5 AI web searches per minute.",
      retryAfter,
    });
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
