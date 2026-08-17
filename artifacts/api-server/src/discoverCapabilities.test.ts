import { describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const chain: Record<string | symbol, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") return (r: (v: unknown[]) => unknown) => r([]);
      return () => proxy;
    },
  });
  return { ...actual, db: proxy, pool: { query: async () => ({ rows: [] }), end: async () => {} }, runMigrations: async () => {} };
});

const { default: app } = await import("./app");

describe("GET /api/discover/capabilities", () => {
  it("reports both searches off when the flags are unset", async () => {
    delete process.env.AI_PUBLIC_PROFILE_SEARCH_ENABLED;
    delete process.env.AI_RESOURCE_SEARCH_ENABLED;
    const res = await request(app).get("/api/discover/capabilities");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ publicProfileSearch: false, resourceSearch: false });
  });

  it("reports them on when the flags are set", async () => {
    process.env.AI_PUBLIC_PROFILE_SEARCH_ENABLED = "true";
    process.env.AI_RESOURCE_SEARCH_ENABLED = "true";
    const res = await request(app).get("/api/discover/capabilities");
    expect(res.body).toEqual({ publicProfileSearch: true, resourceSearch: true });
  });

  it("does not require a session: the answer is configuration, not data", async () => {
    const res = await request(app).get("/api/discover/capabilities");
    expect(res.status).not.toBe(401);
  });
});
