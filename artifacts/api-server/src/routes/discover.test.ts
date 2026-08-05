/**
 * Tests for GET /resources/discover — dead-link filtering
 *
 * Mocked:
 *   - @workspace/integrations-openai-ai-server  (openai)
 *   - ../lib/check-url-reachable                (filterReachableUrls)
 *   - @workspace/db                             (not used by this route)
 *
 * These tests verify:
 *   1. All results are returned when every URL is reachable.
 *   2. Dead URLs are silently dropped before the response.
 *   3. When fewer than 3 URLs survive, the AI is called a second time and
 *      its results are merged in.
 *   4. 502 is returned when both passes yield zero reachable results.
 *   5. 400 is returned for missing/invalid query parameters.
 */

import { describe, it, vi, beforeEach, expect } from "vitest";
import request from "supertest";
import express from "express";

// ── Rate-limit limiter mock — bypass so tests don't exhaust the 5-req cap ─────

vi.mock("../lib/limiters", () => ({
  discoverLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  contentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  globalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/aiCostControls", () => ({
  requireAiSearchEnabled: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  aiSearchDailyUserLimiter: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  aiSearchDailyBudget: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  paidRetryAllowed: () => true,
  recordAiUsage: vi.fn(),
}));

// ── DB mock (not used by discover but required for the module to load) ─────────

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
import resourcesRouter, { isDirectPeopleProfileUrl } from "./resources.js";

// ── Helpers ────────────────────────────────────────────────────────────────────
describe("people profile URL validation", () => {
  it("accepts direct Turkish university and scholarly profiles", () => {
    expect(
      isDirectPeopleProfileUrl("https://example.edu.tr/akademik/ayse-yilmaz"),
    ).toBe(true);
    expect(
      isDirectPeopleProfileUrl(
        "https://scholar.google.com/citations?user=abc123",
      ),
    ).toBe(true);
    expect(
      isDirectPeopleProfileUrl("https://orcid.org/0000-0002-1825-0097"),
    ).toBe(true);
  });

  it("rejects university search, news, and document pages", () => {
    expect(
      isDirectPeopleProfileUrl("https://example.edu.tr/search/professor"),
    ).toBe(false);
    expect(
      isDirectPeopleProfileUrl("https://example.edu.tr/news/professor-award"),
    ).toBe(false);
    expect(
      isDirectPeopleProfileUrl(
        "https://haber.example.edu.tr/en/newsdetail/professor-award",
      ),
    ).toBe(false);
    expect(
      isDirectPeopleProfileUrl(
        "https://example.edu.tr/professor-receives-awards/",
      ),
    ).toBe(false);
    expect(
      isDirectPeopleProfileUrl("https://example.edu.tr/cv/professor.pdf"),
    ).toBe(false);
  });
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", resourcesRouter);
  return app;
}

/** Wrap a JSON payload into the Chat Completions response shape. */
function fakeAIResponse(items: unknown[]) {
  return {
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: JSON.stringify(items), annotations: [] },
        ],
      },
    ],
  } as unknown as Awaited<ReturnType<typeof openai.responses.create>>;
}

/** A minimal valid resource item matching the DiscoverResourcesResponse schema. */
function makeItem(overrides: { url?: string; title?: string } = {}) {
  return {
    title: overrides.title ?? "Khan Academy — Algebra",
    url: overrides.url ?? "https://www.khanacademy.org/math/algebra",
    description: "A free algebra course.",
    format: "video" as const,
    source: "Khan Academy",
    thumbnailUrl: null,
    subject: "Math",
    gradeLevel: "9th Grade",
  };
}

// ── beforeEach ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exact-person platform coverage", () => {
  it("runs a LinkedIn-targeted second pass even after three first-pass profiles", async () => {
    const first = [
      makeItem({
        url: "https://example.edu.tr/faculty/ada-lovelace",
        title: "Ada Lovelace",
      }),
      makeItem({
        url: "https://scholar.google.com/citations?user=ada123",
        title: "Ada Lovelace",
      }),
      makeItem({
        url: "https://orcid.org/0000-0002-1825-0097",
        title: "Ada Lovelace",
      }),
    ];
    const linkedIn = makeItem({
      url: "https://www.linkedin.com/in/ada-lovelace",
      title: "Ada Lovelace",
    });
    vi.mocked(openai.responses.create)
      .mockResolvedValueOnce(fakeAIResponse(first))
      .mockResolvedValueOnce(fakeAIResponse([linkedIn]));

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .query({
        q: "exact-person: Ada Lovelace; affiliation: Example University",
        resultType: "people",
      });

    expect(res.status).toBe(200);
    expect(openai.responses.create).toHaveBeenCalledTimes(2);
    expect(
      (vi.mocked(openai.responses.create).mock.calls[1][0] as { input: string })
        .input,
    ).toContain("site:linkedin.com/in");
    expect(
      res.body.some((item: { url: string }) =>
        item.url.includes("linkedin.com/in/"),
      ),
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Happy path
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/discover — filtering", () => {
  it("returns all results when every URL is reachable", async () => {
    const items = [
      makeItem({ url: "https://khanacademy.org/a" }),
      makeItem({ url: "https://khanacademy.org/b" }),
      makeItem({ url: "https://khanacademy.org/c" }),
    ];

    vi.mocked(openai.responses.create).mockResolvedValueOnce(
      fakeAIResponse(items),
    );
    // All items pass the reachability check
    vi.mocked(filterReachableUrls).mockResolvedValueOnce(items);

    const res = await request(buildApp()).get(
      "/api/resources/discover?q=algebra",
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].url).toBe("https://khanacademy.org/a");
    expect(res.body[0].provenanceLevel).toBe("established");
    expect(res.body[0].linkChecked).toBe(true);
    expect(res.body[0].provenanceSignals).toContain(
      "Established publishing platform",
    );
    // AI was called exactly once
    expect(openai.responses.create).toHaveBeenCalledTimes(1);
    // Reachability was checked exactly once
    expect(filterReachableUrls).toHaveBeenCalledTimes(1);
  });

  it("silently drops dead URLs from the response", async () => {
    const live = makeItem({ url: "https://live.example.com/resource" });
    const dead = makeItem({ url: "https://dead.example.com/gone" });
    const items = [live, live, live, dead];

    vi.mocked(openai.responses.create).mockResolvedValueOnce(
      fakeAIResponse(items),
    );
    // Only the live items survive
    vi.mocked(filterReachableUrls).mockResolvedValueOnce([live, live, live]);

    const res = await request(buildApp()).get(
      "/api/resources/discover?q=biology",
    );

    expect(res.status).toBe(200);
    // dead URL is absent
    expect(
      res.body.every((item: { url: string }) => item.url !== dead.url),
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Retry behaviour
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/discover — retry when too few results survive", () => {
  it("calls the AI a second time when fewer than 3 URLs survive", async () => {
    const firstItems = [
      makeItem({ url: "https://a.example.com" }),
      makeItem({ url: "https://b.example.com" }),
    ];
    const secondItems = [
      makeItem({ url: "https://c.example.com" }),
      makeItem({ url: "https://d.example.com" }),
      makeItem({ url: "https://e.example.com" }),
    ];

    vi.mocked(openai.responses.create)
      .mockResolvedValueOnce(fakeAIResponse(firstItems)) // first call
      .mockResolvedValueOnce(fakeAIResponse(secondItems)); // retry call

    vi.mocked(filterReachableUrls)
      .mockResolvedValueOnce([firstItems[0]]) // only 1 survives
      .mockResolvedValueOnce(secondItems); // all second-batch survive

    const res = await request(buildApp()).get(
      "/api/resources/discover?q=chemistry",
    );

    expect(res.status).toBe(200);
    // Merged: 1 from first pass + 3 from second pass
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(openai.responses.create).toHaveBeenCalledTimes(2);
  });

  it("includes dead URLs in the exclusion hint on retry", async () => {
    const deadUrl = "https://dead.example.com/removed";
    const liveItem = makeItem({ url: "https://live.example.com/ok" });
    const deadItem = makeItem({ url: deadUrl });

    vi.mocked(openai.responses.create)
      .mockResolvedValueOnce(fakeAIResponse([liveItem, deadItem]))
      .mockResolvedValueOnce(fakeAIResponse([]));

    vi.mocked(filterReachableUrls)
      .mockResolvedValueOnce([liveItem]) // only 1 survives (< 3 → retry)
      .mockResolvedValueOnce([]);

    await request(buildApp()).get("/api/resources/discover?q=physics");

    // The retry prompt (messages[0].content) must include the dead URL
    const retryPrompt = (
      vi.mocked(openai.responses.create).mock.calls[1][0] as {
        input: string;
      }
    ).input;
    expect(retryPrompt).toContain(deadUrl);
  });

  it("deduplicates URLs when merging first and second batch survivors", async () => {
    const sharedItem = makeItem({ url: "https://shared.example.com" });
    const extra = makeItem({ url: "https://extra.example.com" });

    vi.mocked(openai.responses.create)
      .mockResolvedValueOnce(fakeAIResponse([sharedItem]))
      .mockResolvedValueOnce(fakeAIResponse([sharedItem, extra]));

    vi.mocked(filterReachableUrls)
      .mockResolvedValueOnce([sharedItem]) // 1 → retry
      .mockResolvedValueOnce([sharedItem, extra]);

    const res = await request(buildApp()).get(
      "/api/resources/discover?q=history",
    );

    expect(res.status).toBe(200);
    const urls = res.body.map((item: { url: string }) => item.url);
    // sharedItem.url must appear only once
    expect(urls.filter((u: string) => u === sharedItem.url)).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Total failure
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/discover — total failure", () => {
  it("returns 502 when both AI passes yield zero reachable results", async () => {
    const item = makeItem({ url: "https://all-dead.example.com" });

    vi.mocked(openai.responses.create)
      .mockResolvedValueOnce(fakeAIResponse([item]))
      .mockResolvedValueOnce(fakeAIResponse([item]));

    vi.mocked(filterReachableUrls)
      .mockResolvedValueOnce([]) // zero survivors → retry
      .mockResolvedValueOnce([]); // still zero

    const res = await request(buildApp()).get(
      "/api/resources/discover?q=geography",
    );

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/no reachable results/i);
  });

  it("returns 502 when the AI returns an empty/unparseable first response", async () => {
    vi.mocked(openai.responses.create).mockResolvedValueOnce(
      fakeAIResponse([]), // empty array → 0 items
    );
    vi.mocked(filterReachableUrls).mockResolvedValueOnce([]);

    const res = await request(buildApp()).get("/api/resources/discover?q=math");

    expect(res.status).toBe(502);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Input validation
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/discover — input validation", () => {
  it("returns 400 when an invalid format enum value is supplied", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/discover?q=algebra&format=book",
    );

    expect(res.status).toBe(400);
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(filterReachableUrls).not.toHaveBeenCalled();
  });
});
