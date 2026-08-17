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

type RouteLayer = {
  name?: string;
  path?: unknown;
  route?: { path?: unknown; methods?: Record<string, boolean> };
  handle?: { stack?: RouteLayer[] };
};

/**
 * Every `METHOD /path` the mounted app declares.
 *
 * Paths are router-relative: Express 5 keeps no static record of where a
 * router was mounted. That is exact for this app because app.ts mounts every
 * router under the same `/api` prefix, which the last test below pins.
 */
function declaredRoutes(stack: RouteLayer[]): string[] {
  const declared: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const path = typeof layer.route.path === "string" ? layer.route.path : "";
      for (const [method, enabled] of Object.entries(
        layer.route.methods ?? {},
      )) {
        if (enabled) declared.push(`${method.toUpperCase()} ${path}`);
      }
      continue;
    }
    if (layer.handle?.stack)
      declared.push(...declaredRoutes(layer.handle.stack));
  }
  return declared;
}

function appRoutes() {
  return declaredRoutes(
    (app as unknown as { router: { stack: RouteLayer[] } }).router.stack,
  );
}

/**
 * Paths two mounted routers are allowed to share, with the reason. Express
 * serves whichever is mounted first and silently ignores the rest, so every
 * entry here names a handler that provably never runs.
 */
const KNOWN_SHADOWED_ROUTES = new Map([
  [
    "POST /auth/login",
    "loginCompat wins over routes/auth; the limiter sits on the mount point",
  ],
]);

describe("no route is declared twice", () => {
  it("has one mounted handler per path, apart from the documented compat route", () => {
    const seen = new Set<string>();
    const duplicates = appRoutes().filter(
      (route) => !seen.add(route) && !KNOWN_SHADOWED_ROUTES.has(route),
    );
    // A second declaration of a live path is dead code at best. At worst it is
    // the /auth/login defect again: the handler carrying the limiter, the
    // quota check or the fix is the one Express throws away. /resources/discover
    // was declared by two files this way, and the copy that lost carried
    // neither the AI quota nor the rate limiter.
    expect(duplicates).toEqual([]);
  });

  it("walks far enough into the app to see the real routes", () => {
    // Guards the inverse mistake: an empty walk would pass the test above
    // without checking anything.
    expect(appRoutes()).toContain("GET /resources/discover");
  });

  it("serves those routes under /api, so relative paths are comparable", async () => {
    // No query, so the handler rejects on validation before touching the
    // database, the open providers or the AI.
    const res = await request(app).get("/api/resources/discover");
    expect(res.status).toBe(400);
  });
});

describe("paging results is not rationed as if it were an AI search", () => {
  it("serves a long run of pages without refusing one", async () => {
    // No provider calls and no AI: the stored catalog answers, which is the
    // path a reader pressing "Search more resources" is on.
    process.env.CATALOG_REMOTE_SEARCH_ENABLED = "false";
    delete process.env.AI_RESOURCE_SEARCH_ENABLED;

    const statuses: number[] = [];
    // Well past the old budget of five. That budget was written when every
    // request called OpenAI; once the catalog answered first it became a cap on
    // reading, and the fifth press of "Search more resources" was refused with
    // a message about AI searches the request had never made.
    for (let page = 1; page <= 12; page += 1) {
      const res = await request(app)
        .get("/api/resources/discover")
        .query({ q: "photosynthesis", page });
      statuses.push(res.status);
    }

    expect(statuses).not.toContain(429);
    expect(statuses.at(-1)).toBe(200);
  }, 30_000);
});

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
