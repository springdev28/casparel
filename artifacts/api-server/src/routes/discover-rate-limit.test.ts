/**
 * Tests for the discoverLimiter applied to GET /resources/discover.
 *
 * Isolated from discover.test.ts so it gets its own module registry
 * (vitest isolate:true) and therefore a fresh in-memory rate-limit counter.
 *
 * RATE_LIMIT_STORE=memory is set in src/test/setup.ts so no DB pool is needed.
 */

import { describe, it, vi, beforeEach, expect } from "vitest";
import request from "supertest";
import express from "express";

// ── DB mock ────────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  const db = {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  };
  return {
    db,
    pool: { query: vi.fn() }, // needed by rateLimitStore when RATE_LIMIT_STORE != memory
    resourcesTable: stub("resources"),
    reviewsTable: stub("reviews"),
    classesTable: stub("classes"),
    classMembersTable: stub("class_members"),
    resourceListsTable: stub("resource_lists"),
    scheduleBlocksTable: stub("schedule_blocks"),
    activityLogTable: stub("activity_log"),
    listItemsTable: stub("list_items"),
  };
});

// ── OpenAI mock ────────────────────────────────────────────────────────────────

vi.mock("@workspace/integrations-openai-ai-server", () => {
  const openai = { responses: { create: vi.fn() } };
  return { openai };
});

// ── filterReachableUrls mock ───────────────────────────────────────────────────

vi.mock("../lib/check-url-reachable", () => ({
  filterReachableUrls: vi.fn(),
  checkUrlReachable: vi.fn(),
}));

// ── Subjects (imported AFTER vi.mock declarations) ─────────────────────────────

import { openai } from "@workspace/integrations-openai-ai-server";
import { filterReachableUrls } from "../lib/check-url-reachable";
import resourcesRouter from "./resources.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  // Trust X-Forwarded-For so the rate limiter keys on the client IP, not 127.0.0.1
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api", resourcesRouter);
  return app;
}

function fakeAIResponse(items: unknown[]) {
  return {
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text" as const,
            text: JSON.stringify(items),
            annotations: [],
          },
        ],
      },
    ],
  } as unknown as Awaited<ReturnType<typeof openai.responses.create>>;
}

function makeItem(overrides: { url?: string } = {}) {
  return {
    title: "Khan Academy — Algebra",
    url: overrides.url ?? "https://www.khanacademy.org/math/algebra",
    description: "A free algebra course.",
    format: "video" as const,
    source: "Khan Academy",
    thumbnailUrl: null,
    subject: "Math",
    gradeLevel: "9th Grade",
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/resources/discover — rate limiting", () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
    // Make every AI + reachability call succeed so only rate limiting can cause a non-200
    const items = [
      makeItem({ url: "https://khanacademy.org/a" }),
      makeItem({ url: "https://khanacademy.org/b" }),
      makeItem({ url: "https://khanacademy.org/c" }),
    ];
    vi.mocked(openai.responses.create).mockResolvedValue(fakeAIResponse(items));
    vi.mocked(filterReachableUrls).mockResolvedValue(items);
  });

  it("allows the first 3 requests within the daily window", async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await request(app)
        .get("/api/resources/discover?q=algebra")
        .set("X-Forwarded-For", "10.0.0.1");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 on the 4th request from the same IP", async () => {
    // Exhaust the 3-request daily allowance
    for (let i = 0; i < 3; i++) {
      await request(app)
        .get("/api/resources/discover?q=algebra")
        .set("X-Forwarded-For", "10.0.0.1");
    }

    // 4th request must be rate-limited
    const res = await request(app)
      .get("/api/resources/discover?q=algebra")
      .set("X-Forwarded-For", "10.0.0.1");

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/search limit/i);
    expect(typeof res.body.retryAfter).toBe("number");
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });

  it("includes a Retry-After header on the 429 response", async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .get("/api/resources/discover?q=algebra")
        .set("X-Forwarded-For", "10.0.0.1");
    }

    const res = await request(app)
      .get("/api/resources/discover?q=algebra")
      .set("X-Forwarded-For", "10.0.0.1");

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does not rate-limit a different IP in the same window", async () => {
    // Exhaust quota for IP A
    for (let i = 0; i < 3; i++) {
      await request(app)
        .get("/api/resources/discover?q=algebra")
        .set("X-Forwarded-For", "10.0.0.1");
    }

    // IP B should still be allowed
    const res = await request(app)
      .get("/api/resources/discover?q=algebra")
      .set("X-Forwarded-For", "10.0.0.2");

    expect(res.status).toBe(200);
  });
});
