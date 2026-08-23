/**
 * @fileOverview Verification role: exercises App.Routing.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Tests the REAL app, with every router mounted in the real order.
 *
 * Every other route test builds a throwaway express app and mounts a single
 * router on it. That is why a serious hole stayed invisible: routes/auth.ts and
 * routes/loginCompat.ts both declare POST /auth/login, Express serves whichever
 * is mounted first, and the brute-force limiter was attached to the copy that
 * never ran. A test that mounts one router at a time can never see a conflict
 * between two routers.
 *
 * The database is stubbed with a Proxy rather than an explicit table list,
 * because the point here is the middleware order, not any query. Login is
 * expected to fail against the stub; what matters is the status code once the
 * budget is spent.
 */
import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", async (importOriginal) => {
  // Keep the real table definitions - they are plain Drizzle objects and need
  // no connection - and replace only the things that would talk to Postgres.
  const actual = await importOriginal<Record<string, unknown>>();
  // Any query chain resolves to an empty result set.
  const chain: Record<string | symbol, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown[]) => unknown) => resolve([]);
      }
      return () => proxy;
    },
  });
  return {
    ...actual,
    db: proxy,
    pool: { query: async () => ({ rows: [] }), end: async () => {} },
    runMigrations: async () => {},
  };
});

const { default: app } = await import("./app");

/** authLimiter allows 20 attempts per IP per 15 minutes. */
const AUTH_BUDGET = 20;

describe("credential rate limiting is not shadowed by route order", () => {
  it("throttles POST /api/auth/login once the budget is spent", async () => {
    let last = 0;
    // One past the budget. Every attempt uses a wrong password on purpose.
    for (let i = 0; i <= AUTH_BUDGET; i += 1) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "brute@example.com", password: `guess-${i}` });
      last = res.status;
    }
    expect(last).toBe(429);
  }, 30_000);

  it("serves POST /api/auth/login from a router, not a 404", async () => {
    // Guards the inverse mistake: mounting the limiter on a path that no
    // router serves would make the test above pass for the wrong reason.
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "someone@example.com", password: "whatever" });
    expect(res.status).not.toBe(404);
  });
});
