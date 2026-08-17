/**
 * Tests for GET /resources/discover, dead-link filtering
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

// ── Rate-limit limiter mock, bypass so tests don't exhaust the 5-req cap ─────

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
  consumeAiQuota: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 10, retryAfter: 60 }),
}));

// Admin by default, so the quota checks stay out of the way of the tests that
// are about the search itself. One test below turns it off, because the guard on
// the AI call is only reachable for an ordinary reader.
let requestIsAdmin = true;
vi.mock("../lib/adminAccess", () => ({
  isAdminRequest: () => requestIsAdmin,
}));
vi.mock("../lib/catalog", () => ({
  searchCatalog: vi.fn().mockResolvedValue([]),
  resolveCatalogSearch: vi
    .fn()
    .mockResolvedValue({ minRelevanceScore: 1, offset: 0, total: 0 }),
  searchOpenLibraryAndStore: vi.fn().mockResolvedValue(0),
  searchOpenWikisAndStore: vi.fn().mockResolvedValue(0),
}));

// ── DB mock (not used by discover but required for the module to load) ─────────

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  // Any query chain resolves to an empty result set. A signed-in reader's
  // request reads their own saved resources before searching, so `select` has to
  // be chainable or the route fails with a 500 before reaching the search.
  const chain: Record<string | symbol, unknown> = {};
  const emptyQuery: unknown = new Proxy(chain, {
    get(_target, property) {
      if (property === "then")
        return (resolve: (value: unknown[]) => unknown) => resolve([]);
      return () => emptyQuery;
    },
  });
  const db = {
    select: vi.fn(() => emptyQuery),
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
import {
  resolveCatalogSearch,
  searchCatalog,
  searchOpenLibraryAndStore,
  searchOpenWikisAndStore,
} from "../lib/catalog";
import { consumeAiQuota } from "../lib/aiCostControls";
import { issueToken } from "../lib/auth";
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
    title: overrides.title ?? "Khan Academy, Algebra",
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
  // clearAllMocks forgets calls but keeps implementations, so a test that sets a
  // persistent mockResolvedValue would otherwise answer every later test too.
  vi.mocked(searchCatalog).mockReset().mockResolvedValue([]);
  vi.mocked(resolveCatalogSearch)
    .mockReset()
    .mockResolvedValue({ minRelevanceScore: 1, offset: 0, total: 0 });
  vi.mocked(searchOpenLibraryAndStore).mockReset().mockResolvedValue(0);
  vi.mocked(searchOpenWikisAndStore).mockReset().mockResolvedValue(0);
  requestIsAdmin = true;
  process.env.AI_RESOURCE_SEARCH_ENABLED = "true";
  process.env.AI_PUBLIC_PROFILE_SEARCH_ENABLED = "true";
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

    const res = await request(buildApp()).get("/api/resources/discover").query({
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
// Paging, "Search more resources"
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/discover, paging", () => {
  /** A stored-catalog row as searchCatalog returns it. */
  function catalogRow(url: string) {
    return {
      title: "Open Algebra",
      url,
      description: "An open algebra course.",
      format: "interactive" as const,
      source: "Example University",
      thumbnailUrl: null,
      subject: "Mathematics",
      gradeLevel: "Secondary education",
    };
  }

  it("tops the catalog up from the open providers when a later page runs thin", async () => {
    // Page 1 handed back six rows, so page 2 resumes at row six.
    vi.mocked(resolveCatalogSearch).mockResolvedValueOnce({
      minRelevanceScore: 1,
      offset: 6,
      total: 6,
    });
    vi.mocked(searchCatalog)
      .mockResolvedValueOnce([]) // nothing stored past row six yet
      .mockResolvedValue([catalogRow("https://example.edu/algebra-2")]);

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra", page: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // The top-up used to be gated on page === 1, which left "Search more
    // resources" with nothing new to return once the stored rows ran out.
    expect(searchOpenWikisAndStore).toHaveBeenCalled();
    // Providers are asked for the window matching the requested page.
    expect(searchOpenLibraryAndStore).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    // And for the query's first window, which a full page one never read.
    expect(searchOpenLibraryAndStore).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
    // The AI allowance is never spent while the catalog can still answer.
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("keeps reading windows while the page is still short", async () => {
    // One round used to be the entire effort, and only a completely empty page
    // got a second look — so a page that came back with five results kept them
    // and offered nothing more. That is what a reader who had excluded a source
    // was left with, because the exclusion removed most of what the round found.
    vi.mocked(resolveCatalogSearch).mockResolvedValueOnce({
      minRelevanceScore: 1,
      offset: 0,
      total: 2,
    });
    const unit = (slug: string) => ({
      ...catalogRow(`https://example.edu/${slug}`),
      title: `Open Algebra, unit ${slug}`,
    });
    vi.mocked(searchCatalog)
      .mockResolvedValueOnce([unit("a")])
      .mockResolvedValueOnce([unit("a"), unit("b")])
      .mockResolvedValue([unit("a"), unit("b"), unit("c")]);

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra" });

    expect(res.status).toBe(200);
    // Each round added something, so it kept going and the reader got all three.
    expect(res.body).toHaveLength(3);
    expect(vi.mocked(searchOpenWikisAndStore).mock.calls.length).toBeGreaterThan(
      1,
    );
  });

  it("stops asking once a whole round adds nothing", async () => {
    // The budget is there to fill a thin page, not to hammer the providers for a
    // query they have nothing for.
    vi.mocked(resolveCatalogSearch).mockResolvedValueOnce({
      minRelevanceScore: 1,
      offset: 0,
      total: 1,
    });
    vi.mocked(searchCatalog).mockResolvedValue([
      catalogRow("https://example.edu/a"),
    ]);

    await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra" });

    // One round of windows, then one attempt at the broadened queries, then it
    // gives up rather than spending the whole budget.
    expect(
      vi.mocked(searchOpenWikisAndStore).mock.calls.length,
    ).toBeLessThanOrEqual(3);
  });

  it("reads both catalog passes at the offset resolved before the top-up", async () => {
    vi.mocked(resolveCatalogSearch).mockResolvedValueOnce({
      minRelevanceScore: 1,
      offset: 6,
      total: 6,
    });
    vi.mocked(searchCatalog)
      .mockResolvedValueOnce([])
      .mockResolvedValue([catalogRow("https://example.edu/algebra-2")]);

    await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra", page: 2 });

    // Rows stored by the top-up get the highest ids and sort last. Re-deriving
    // the offset from the grown catalog would step over exactly those rows — and
    // the page reads more than twice now, so *every* read has to use the offset
    // resolved before the first one, not just the second.
    const offsets = vi
      .mocked(searchCatalog)
      .mock.calls.map(([options]) => options.offset);
    expect(offsets.length).toBeGreaterThan(1);
    expect(new Set(offsets)).toEqual(new Set([6]));
  });

  it("leaves a full later page alone", async () => {
    vi.mocked(resolveCatalogSearch).mockResolvedValueOnce({
      minRelevanceScore: 1,
      offset: 16,
      total: 40,
    });
    vi.mocked(searchCatalog).mockResolvedValueOnce(
      // Distinct titles: the response collapses duplicate works, so sixteen
      // rows sharing one title would legitimately arrive as a single card.
      Array.from({ length: 16 }, (_, index) => ({
        ...catalogRow(`https://example.edu/algebra-${index}`),
        title: `Open Algebra, unit ${index}`,
      })),
    );

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra", page: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(16);
    expect(searchOpenLibraryAndStore).not.toHaveBeenCalled();
    expect(searchCatalog).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Happy path
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/discover, filtering", () => {
  it("passes the selected source credibility to the stored catalog", async () => {
    const academicResults = [
      {
        ...makeItem(),
        sourceCredibility: "academic" as const,
      },
    ];
    vi.mocked(searchCatalog)
      .mockResolvedValueOnce(academicResults)
      .mockResolvedValueOnce(academicResults);

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "calculus", sourceQuality: "academic" });

    expect(res.status).toBe(200);
    expect(searchCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ sourceQuality: "academic" }),
    );
    expect(res.body[0].provenanceSignals).toContain(
      "Academic, scholarly, or editorially reviewed source",
    );
  });

  it("returns all results when every URL is reachable", async () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      makeItem({
        url: `https://khanacademy.org/${index + 1}`,
        title: `Khan Academy, lesson ${index + 1}`,
      }),
    );

    vi.mocked(openai.responses.create).mockResolvedValueOnce(
      fakeAIResponse(items),
    );
    // All items pass the reachability check
    vi.mocked(filterReachableUrls).mockResolvedValueOnce(items);

    const res = await request(buildApp()).get(
      "/api/resources/discover?q=algebra",
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body[0].url).toBe("https://khanacademy.org/1");
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
    const live = Array.from({ length: 8 }, (_, index) =>
      makeItem({ url: `https://live.example.com/resource-${index + 1}` }),
    );
    const dead = makeItem({ url: "https://dead.example.com/gone" });
    const items = [...live, dead];

    vi.mocked(openai.responses.create).mockResolvedValueOnce(
      fakeAIResponse(items),
    );
    // Only the live items survive
    vi.mocked(filterReachableUrls).mockResolvedValueOnce(live);

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

describe("GET /api/resources/discover, retry when too few results survive", () => {
  it("calls the AI a second time when fewer than 3 URLs survive", async () => {
    // Distinct titles per item: same-titled pages on one domain are one work
    // as far as the response is concerned, and would arrive as one card.
    const firstItems = [
      makeItem({ url: "https://a.example.com", title: "Chemistry basics" }),
      makeItem({ url: "https://b.example.com", title: "Chemistry reactions" }),
    ];
    const secondItems = [
      makeItem({ url: "https://c.example.com", title: "Organic chemistry" }),
      makeItem({ url: "https://d.example.com", title: "Periodic table guide" }),
      makeItem({ url: "https://e.example.com", title: "Stoichiometry drills" }),
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

describe("GET /api/resources/discover, total failure", () => {
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

describe("GET /api/resources/discover, input validation", () => {
  it("returns 400 when an invalid format enum value is supplied", async () => {
    const res = await request(buildApp()).get(
      "/api/resources/discover?q=algebra&format=book",
    );

    expect(res.status).toBe(400);
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(filterReachableUrls).not.toHaveBeenCalled();
  });

  it("rejects a missing query instead of searching for \"undefined\"", async () => {
    // q is a coerced string: a missing parameter used to reach the handler as
    // the literal "undefined" and be searched for in full, remote calls and
    // AI allowance included.
    const res = await request(buildApp()).get("/api/resources/discover");

    expect(res.status).toBe(400);
    expect(searchCatalog).not.toHaveBeenCalled();
    expect(searchOpenLibraryAndStore).not.toHaveBeenCalled();
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("rejects a blank query", async () => {
    const res = await request(buildApp()).get("/api/resources/discover?q=%20%20");

    expect(res.status).toBe(400);
    expect(searchCatalog).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Excluding a source
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/resources/discover, excluding a source", () => {
  it("passes the exclusion to the stored catalog", async () => {
    // A full page, or the handler tops up from the providers and the
    // assertion would be about the wrong call.
    vi.mocked(searchCatalog).mockResolvedValue(
      Array.from({ length: 8 }, (_, index) =>
        makeItem({
          url: `https://example.edu/algebra-${index}`,
          title: `Open Algebra, unit ${index}`,
        }),
      ),
    );

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra", excludeSource: "wikipedia" });

    expect(res.status).toBe(200);
    expect(searchCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSource: "wikipedia" }),
    );
  });

  it("tells the AI what not to use as well as what to prefer", async () => {
    vi.mocked(searchCatalog).mockResolvedValue([]);
    vi.mocked(openai.responses.create).mockResolvedValueOnce(
      fakeAIResponse([makeItem()]),
    );
    vi.mocked(filterReachableUrls).mockResolvedValueOnce([makeItem()]);

    await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra", excludeSource: "wikipedia" });

    const prompt = (
      vi.mocked(openai.responses.create).mock.calls[0][0] as { input: string }
    ).input;
    expect(prompt).toContain("Never use results from");
    expect(prompt).toContain("wikipedia");
  });
});

describe("GET /api/resources/discover, one source per page", () => {
  it("does not let a single site take every slot", async () => {
    // Relevance alone gave the biggest provider the whole page, which reads as
    // "few results" however many there are.
    vi.mocked(searchCatalog).mockResolvedValue([
      ...Array.from({ length: 7 }, (_, index) =>
        makeItem({
          url: `https://en.wikipedia.org/wiki/topic_${index}`,
          title: `Wikipedia topic ${index}`,
        }),
      ),
      makeItem({
        url: "https://en.wikibooks.org/wiki/Algebra",
        title: "Algebra",
      }),
    ]);

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra" });

    const hosts = (res.body as { url: string }[]).map(
      (item) => new URL(item.url).hostname,
    );
    expect(hosts).toHaveLength(8);
    // The Wikibooks result is pulled up rather than left in last place.
    expect(hosts.indexOf("en.wikibooks.org")).toBeLessThan(7);
  });
});

describe("GET /api/resources/discover, the AI's own per-minute allowance", () => {
  /**
   * The guard that used to sit on the route, counting every request. It now
   * counts only requests that reach the AI, so paging the stored catalog can no
   * longer spend an allowance it never uses — but the AI still has one.
   */
  it("refuses a sixth AI search in a minute, and says which limit was hit", async () => {
    requestIsAdmin = false;
    // The catalog has nothing, so the request falls through to the AI.
    vi.mocked(searchCatalog).mockResolvedValue([]);
    vi.mocked(consumeAiQuota).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfter: 42,
    });

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .set("authorization", `Bearer ${issueToken(7, "student")}`)
      .query({ q: "algebra" });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain("AI web searches per minute");
    expect(res.headers["retry-after"]).toBe("42");
    expect(consumeAiQuota).toHaveBeenCalledWith(
      "discover-ai-user-minute",
      "user:7",
      60 * 1000,
      5,
    );
    // Nothing was spent on the AI itself.
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("lets an ordinary reader page the catalog without touching that allowance", async () => {
    requestIsAdmin = false;
    vi.mocked(searchCatalog).mockResolvedValue([
      makeItem({ url: "https://en.wikibooks.org/wiki/Algebra", title: "Algebra" }),
    ]);

    const res = await request(buildApp())
      .get("/api/resources/discover")
      .query({ q: "algebra", page: 4 });

    expect(res.status).toBe(200);
    expect(consumeAiQuota).not.toHaveBeenCalled();
  });
});
