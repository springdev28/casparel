import rateLimit from "express-rate-limit";
import { buildRateLimitStore } from "./rateLimitStore";
import { isAdminRequest } from "./adminAccess";

/**
 * Global API limiter, 100 requests per minute per IP.
 * Applied to every /api route.
 */
export const globalLimiter = rateLimit({
  requestPropertyName: "globalRateLimit",
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("global"),
  handler(req, res, _next, options) {
    const reset = (req as unknown as { globalRateLimit?: { resetTime?: Date } }).globalRateLimit?.resetTime;
    const retryAfter = reset
      ? Math.ceil((reset.getTime() - Date.now()) / 1000)
      : Math.ceil(options.windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "Too many requests. Please slow down.", retryAfter });
  },
});

/**
 * Credential limiter, 20 attempts per 15 minutes per IP, for sign-in and
 * registration.
 *
 * This deliberately lives here rather than next to the handler it protects.
 * It used to be defined inside routes/auth.ts and attached to that file's
 * POST /auth/login, which left brute-force protection switched off in
 * practice: routes/loginCompat.ts declares its own POST /auth/login and is
 * mounted first in app.ts, so Express matched the compat handler and the
 * limiter on the second copy was never reached. Password guessing was
 * bounded only by the 100/min global limiter.
 *
 * Attaching it at the mount point instead of to a handler makes it
 * unshadowable: it now runs before either router sees the request, so adding
 * another /auth/login handler in future cannot silently disable it again.
 *
 * No admin skip. Bypassing the limiter requires being recognised as an admin,
 * and recognising anyone is exactly what these routes have not done yet.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("auth"),
  handler(_req, res, _next, options) {
    const retryAfter = Math.ceil(options.windowMs / 1000 / 60);
    res.setHeader("Retry-After", retryAfter * 60);
    res.status(429).json({
      error: `Too many sign-in attempts. Please wait ${retryAfter} minutes and try again.`,
      retryAfter: retryAfter * 60,
    });
  },
});

/**
 * Discover limiter, 30 requests per minute per IP.
 *
 * This used to be five, set when GET /resources/discover called OpenAI with
 * web_search_preview on every request. It no longer does: the stored catalog
 * answers first and AI is a fallback reached only when the catalog has nothing.
 * Five stopped being a guard on an expensive call and became a cap on reading —
 * a reader who searches once and then presses "Search more resources" four
 * times was refused on the fifth press, and told "you can run up to 5 AI web
 * searches per minute" about a search that never went near an AI. Paging
 * through results is what the page is for, so the cap has to be a browsing
 * cap; the AI's own per-minute allowance now lives with the AI call, where it
 * only counts requests that actually make one.
 */
export const discoverLimiter = rateLimit({
  skip: isAdminRequest,
  requestPropertyName: "discoverRateLimit",
  validate: { singleCount: false },
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("discover"),
  handler(req, res, _next, options) {
    const reset = (req as unknown as { discoverRateLimit?: { resetTime?: Date } }).discoverRateLimit?.resetTime;
    const retryAfter = reset
      ? Math.ceil((reset.getTime() - Date.now()) / 1000)
      : Math.ceil(options.windowMs / 1000);
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({
      error: "You're searching very quickly. Please wait a moment and try again.",
      retryAfter,
    });
  },
});

/**
 * Content-creation limiter, 20 requests per minute per IP.
 * Applied to POST /resources and POST /reviews to slow automated content spam.
 */
export const contentLimiter = rateLimit({
  skip: isAdminRequest,
  requestPropertyName: "contentRateLimit",
  validate: { singleCount: false },
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRateLimitStore("content"),
  handler(req, res, _next, options) {
    const reset = (req as unknown as { contentRateLimit?: { resetTime?: Date } }).contentRateLimit?.resetTime;
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
