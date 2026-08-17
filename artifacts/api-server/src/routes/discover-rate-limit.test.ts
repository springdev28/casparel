import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../lib/limiters", () => ({
  discoverLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  contentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  globalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/aiCostControls", () => ({
  paidRetryAllowed: () => false,
  recordAiUsage: vi.fn(),
  consumeAiQuota: vi.fn(),
}));
vi.mock("../lib/adminAccess", () => ({ isAdminRequest: () => false }));
vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
    resourcesTable: stub("resources"),
    reviewsTable: stub("reviews"),
    usersTable: stub("users"),
    learningGoalsTable: stub("learning_goals"),
    activityLogTable: stub("activity_log"),
  };
});
vi.mock("../lib/catalog", () => ({
  searchCatalog: vi.fn().mockResolvedValue([
    {
      title: "Open Algebra",
      url: "https://example.edu/algebra",
      description: "An open algebra course.",
      format: "interactive",
      source: "Example University",
      thumbnailUrl: null,
      subject: "Mathematics",
      gradeLevel: "Secondary education",
    },
  ]),
  resolveCatalogSearch: vi
    .fn()
    .mockResolvedValue({ minRelevanceScore: 1, offset: 0, total: 0 }),
  searchOpenLibraryAndStore: vi.fn().mockResolvedValue(0),
  searchOpenWikisAndStore: vi.fn().mockResolvedValue(0),
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { responses: { create: vi.fn() } },
}));
vi.mock("../lib/check-url-reachable", () => ({
  filterReachableUrls: vi.fn(),
  fetchPublicText: vi.fn(),
}));

import { openai } from "@workspace/integrations-openai-ai-server";
import { consumeAiQuota } from "../lib/aiCostControls";
import resourcesRouter from "./resources.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", resourcesRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_RESOURCE_SEARCH_ENABLED;
  delete process.env.AI_PUBLIC_PROFILE_SEARCH_ENABLED;
});

describe("GET /api/resources/discover, free catalog path", () => {
  it("does not call AI or consume an AI quota", async () => {
    const response = await request(buildApp()).get(
      "/api/resources/discover?q=algebra",
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.headers["x-search-provider"]).toBe("stored-catalog");
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(consumeAiQuota).not.toHaveBeenCalled();
  });

  it("keeps ordinary searches available beyond the former three-per-day AI cap", async () => {
    for (let requestNumber = 0; requestNumber < 4; requestNumber += 1) {
      const response = await request(buildApp()).get(
        "/api/resources/discover?q=algebra",
      );
      expect(response.status).toBe(200);
    }
    expect(openai.responses.create).not.toHaveBeenCalled();
  });
});
