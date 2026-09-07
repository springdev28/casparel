import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("@workspace/db", async () => {
  const { pgTable, integer, text } = await import("drizzle-orm/pg-core");
  return {
    db: { select: vi.fn(), update: vi.fn() },
    usersTable: pgTable("users", { id: integer("id"), plan: text("plan") }),
  };
});
vi.mock("../lib/limiters", () => ({
  contentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
import { db } from "@workspace/db";
import { issueToken } from "../lib/auth";
import router from "./billing";

const fetchMock = vi.fn();
const where = vi.fn().mockResolvedValue(undefined);
const set = vi.fn(() => ({ where }));
const user = {
  id: 42,
  email: "billing@example.test",
  role: "student",
  plan: "free",
  bannedAt: null,
};
const app = express().use(express.json()).use("/api", router);
const call = () =>
  request(app)
    .post("/api/users/me/entitlements/reconcile")
    .set("Authorization", `Bearer ${issueToken(42, "student")}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "secret-server-key");
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where: async () => [user] }),
  } as unknown as ReturnType<typeof db.select>);
  vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<
    typeof db.update
  >);
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      subscriber: { entitlements: { plus: { expires_date: null } } },
    }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /users/me/entitlements/reconcile", () => {
  it("requires authentication before contacting RevenueCat", async () => {
    expect(
      (await request(app).post("/api/users/me/entitlements/reconcile")).status,
    ).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("ignores client-supplied account and plan and preserves institutional grants", async () => {
    expect(
      (await call().send({ userId: 999, plan: "pro", role: "admin" })).status,
    ).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.revenuecat.com/v1/subscribers/42",
    );
    expect(set).toHaveBeenCalledWith({ plan: "plus", planExpiresAt: null });
    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(predicate.sql).toContain('"users"."plan" <>');
    expect(predicate.params).toEqual([42, "institutional"]);
  });
  it("preserves access on provider failure or malformed responses", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    expect((await call()).status).toBe(502);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect((await call()).status).toBe(502);
    expect(set).not.toHaveBeenCalled();
  });
  it("reports missing server configuration without changing access", async () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "");
    expect((await call()).status).toBe(503);
    expect(set).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
