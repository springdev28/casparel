import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { buildRateLimitStore } from "./rateLimitStore";
import { isAdminRequest } from "./adminAccess";
import { decodeToken } from "./auth";

/**
 * Count against the account when there is one, the address otherwise.
 *
 * Every limiter here used to count per address, and this product is sold to
 * schools, where a whole class shares one. A signed-in page costs about ten API
 * requests, so a per-address ceiling of a hundred a minute gave a class of
 * thirty ten page loads between them -- the room opening the app at the start
 * of a lesson exceeded it three times over and was told to slow down.
 *
 * What these limits are actually for is one caller misbehaving, and a caller is
 * an account. Anonymous traffic still counts per address, which is where a
 * flood with no account to name comes from.
 *
 * The token is decoded here rather than read from req.userId because these run
 * as route middleware ahead of requireAuth, so nothing has authenticated yet.
 * decodeToken verifies the signature, so a forged token cannot claim somebody
 * else's bucket; an unusable one falls back to the address.
 *
 * The address half is not a raw req.ip, because that is not a caller when the
 * caller has IPv6. A single subscriber is routinely handed a /64 or larger --
 * billions of billions of addresses -- so anything keyed on the whole address
 * gives one machine a fresh empty bucket whenever it likes: an unlimited
 * limiter, silently, and only for the callers modern enough to have IPv6.
 * express-rate-limit ships ipKeyGenerator to collapse an address to its
 * allocation (a /56 by default) for exactly this, and warns at startup when a
 * custom keyGenerator looks like it forgot. All three of ours did. IPv4 is
 * returned unchanged.
 *
 * It is called at each key site rather than behind a shared helper on purpose:
 * that check reads the key generator's own source text, so a helper satisfies
 * the requirement while still printing the warning at every boot -- a
 * permanent false alarm about code that is correct.
 */
function perAccountKey(req: { headers: { authorization?: string }; ip?: string }): string {
  const header = req.headers.authorization;
  const userId = header?.startsWith("Bearer ")
    ? decodeToken(header.slice(7))?.userId
    : undefined;
  return userId ? `user:${userId}` : `addr:${req.ip ? ipKeyGenerator(req.ip) : "unknown"}`;
}

/**
 * Global API limiter, 100 requests per minute per IP.
 * Applied to every /api route.
 */
export const globalLimiter = rateLimit({
  requestPropertyName: "globalRateLimit",
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: perAccountKey,
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
 * Credential limiter, per address: 50 failed attempts per 15 minutes, for
 * sign-in and registration. Paired with authAccountLimiter below, which is the
 * tighter per-account guard.
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
  // Raised from 20 together with skipSuccessfulRequests below. This is now a
  // ceiling on *failures* from one address, which is a spray guard; the guard
  // against guessing one person's password is authAccountLimiter, and it is
  // much tighter.
  max: 50,
  /**
   * Only failures count.
   *
   * The cap is per IP, and this product is sold to schools. Thirty students on
   * one classroom connection share a single address, so twenty *sign-ins* per
   * quarter hour locked out most of a class arriving at nine o'clock -- and the
   * ones refused were told they had made too many sign-in attempts, which from
   * where they sat was untrue: it was their first.
   *
   * Counting only what failed keeps the guard this limiter exists for. A
   * password guesser generates nothing but failures; a classroom signing in
   * generates almost none. The two stop looking alike, which a per-IP count of
   * all requests could never manage.
   *
   * Requires a store that can decrement, which the Postgres store implements.
   */
  skipSuccessfulRequests: true,
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
 * Credential limiter, per account: 10 failed attempts per 15 minutes.
 *
 * The per-IP limiter above cannot tell thirty people mistyping once from one
 * person guessing thirty times, because from the outside a classroom and an
 * attacker are the same address. This one counts against the address being
 * signed in to, so guessing one person's password is bounded however many
 * connections it comes from, while a class full of people is unaffected by
 * each other's mistakes.
 *
 * Only failures count here too: signing in correctly, however often, costs
 * nothing.
 *
 * The accepted cost is that somebody who knows your email can keep you locked
 * out for a quarter of an hour by failing ten times on purpose. That is the
 * usual trade for per-account throttling, and it is the better half of it:
 * without this, guessing scales with however many addresses an attacker can
 * come from, which is not a limit at all.
 */
export const authAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  store: buildRateLimitStore("auth-account"),
  /**
   * The account being attempted, not the caller.
   *
   * express.json() runs before this is mounted, so the body is parsed. A
   * request without a usable email is keyed by address instead: it cannot be
   * a real sign-in, and letting it through unkeyed would be a way to opt out
   * of this limiter by omitting a field.
   */
  keyGenerator: (req): string => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    if (typeof email === "string" && email.trim()) {
      return `email:${email.trim().toLowerCase().slice(0, 320)}`;
    }
    return `addr:${req.ip ? ipKeyGenerator(req.ip) : "unknown"}`;
  },
  handler(_req, res, _next, options) {
    const retryAfter = Math.ceil(options.windowMs / 1000 / 60);
    res.setHeader("Retry-After", retryAfter * 60);
    res.status(429).json({
      error: `Too many sign-in attempts for this account. Please wait ${retryAfter} minutes and try again.`,
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
 * Content-creation limiter, 20 writes per minute per account.
 *
 * Per account, not per address, for the reason the credential limiter had to
 * change: a school shares one connection. Thirty students accepting a class
 * invitation and making their first activity is sixty writes from a single
 * address within a couple of minutes, and a per-IP cap of twenty told most of
 * the room they were submitting too quickly. Spam is something an account
 * does -- one account writing a hundred things a minute -- and counting it
 * that way tells the two apart. Overall volume from one address is still
 * bounded by globalLimiter.
 *
 * Keyed by decoding the bearer token rather than by req.userId, because this
 * runs as route middleware ahead of requireAuth and there is no userId on the
 * request yet. isAdminRequest in the skip above reads the header the same way.
 * Anything without a usable token falls back to the address, so an
 * unauthenticated caller cannot opt out of the limit by sending no token.
 */
export const contentLimiter = rateLimit({
  skip: isAdminRequest,
  requestPropertyName: "contentRateLimit",
  validate: { singleCount: false },
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: perAccountKey,
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
