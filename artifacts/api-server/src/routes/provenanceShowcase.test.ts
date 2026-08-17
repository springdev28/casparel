/**
 * Tests for GET /resources/provenance-showcase, the landing hero's data:
 *  • signed out → the platform's most-saved sources, not personalised
 *  • signed in with saves → that account's own saves, personalised
 *  • signed in with no saves → falls back to the platform view, not an
 *    empty card
 *  • nothing saved anywhere → the catalogue itself, so a young library is
 *    never illustrated with the client's hardcoded examples
 *  • verdicts come from the URL (institutional/established/independent), the
 *    same registry rule the resource pages use, with no AI and no outbound
 *    request
 *  • a database failure answers 500, not an empty card: the hero falls back
 *    to its own examples either way, and an empty 200 is indistinguishable
 *    from an empty catalogue — which is how a real failure stayed hidden
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

/** Rows the mocked query chain resolves to, set per test. */
let rows: Array<Record<string, unknown>> = [];
/**
 * Rows per successive query, when a test needs the fallback chain to differ
 * between calls (saves → platform → catalogue). Falls back to `rows`.
 */
let rowsByCall: Array<Array<Record<string, unknown>>> | null = null;
let callIndex = 0;
let failWith: Error | null = null;
/** Which query calls should throw, by index; overrides `failWith` when set. */
let failByCall: Array<Error | null> | null = null;
/** Whether the built query joined resource_lists, i.e. asked for one owner. */
let joinedLists = false;

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name, id: `${name}.id` });
  return {
    db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() },
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    usersTable: stub("users"),
    resourcesTable: stub("resources"),
    reviewsTable: stub("reviews"),
    learningGoalsTable: stub("learning_goals"),
    activityLogTable: stub("activity_log"),
    catalogResourcesTable: stub("catalog_resources"),
    listItemsTable: stub("list_items"),
    resourceListsTable: stub("resource_lists"),
    sourceReviewCacheTable: stub("source_review_cache"),
  };
});

vi.mock("../lib/resourceVisibility", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/resourceVisibility")>();
  return { ...actual, optionalViewerId: () => viewerId };
});

let viewerId: number | null = null;

import { db } from "@workspace/db";
import resourcesRouter from "./resources.js";

/**
 * A thenable query builder: every Drizzle method returns itself, and awaiting
 * it resolves the rows (or throws). `innerJoin` records whether the personal
 * branch was taken, which is what "roles do not mix"-style routing needs to be
 * asserted on rather than inferred from the response alone.
 */
function mockQueryChain() {
  vi.mocked(db.select).mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "innerJoin",
      "leftJoin",
      "where",
      "groupBy",
      "orderBy",
      "limit",
    ]) {
      chain[method] = (...args: unknown[]) => {
        if (
          method === "innerJoin" &&
          (args[0] as { _name?: string } | undefined)?._name ===
            "resource_lists"
        ) {
          joinedLists = true;
        }
        return chain;
      };
    }
    chain.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => {
      const perCall = failByCall ? (failByCall[callIndex] ?? null) : null;
      const boom = perCall ?? failWith;
      const next = rowsByCall ? (rowsByCall[callIndex] ?? []) : rows;
      callIndex += 1;
      if (boom) return reject(boom);
      return resolve(next);
    };
    return chain as unknown as ReturnType<typeof db.select>;
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", resourcesRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  viewerId = null;
  failWith = null;
  joinedLists = false;
  rows = [];
  rowsByCall = null;
  failByCall = null;
  callIndex = 0;
  mockQueryChain();
});

// The mocked table stubs carry `_name`, and innerJoin is called with the table
// object; compare on that rather than the stub identity.
function withLists() {
  return joinedLists;
}

describe("GET /resources/provenance-showcase", () => {
  it("serves the platform's most-saved sources to a visitor", async () => {
    rows = [
      {
        id: 7,
        title: "Linear Algebra",
        url: "https://ocw.mit.edu/courses/18-06",
        subject: "Mathematics",
        savedCount: 12,
      },
    ];
    const res = await request(buildApp()).get(
      "/api/resources/provenance-showcase",
    );
    expect(res.status).toBe(200);
    expect(res.body.personalised).toBe(false);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({
      id: 7,
      title: "Linear Algebra",
      host: "ocw.mit.edu",
      savedCount: 12,
    });
  });

  it("personalises to the caller's own saves when signed in", async () => {
    viewerId = 42;
    rows = [
      {
        id: 3,
        title: "Statistics primer",
        url: "https://www.khanacademy.org/math/statistics",
        subject: "Mathematics",
        savedCount: 2,
      },
    ];
    const res = await request(buildApp()).get(
      "/api/resources/provenance-showcase",
    );
    expect(res.status).toBe(200);
    expect(res.body.personalised).toBe(true);
    expect(withLists()).toBe(true);
    expect(res.body.entries[0].host).toBe("khanacademy.org");
  });

  it("falls back to the platform view for an account that saved nothing", async () => {
    viewerId = 42;
    // Empty personal saves, then a platform row on the second query.
    rowsByCall = [
      [],
      [
        {
          id: 9,
          title: "Shared favourite",
          url: "https://openstax.org/books/x",
          subject: "Physics",
          savedCount: 4,
        },
      ],
    ];
    const res = await request(buildApp()).get(
      "/api/resources/provenance-showcase",
    );
    expect(res.status).toBe(200);
    // Not the user's own saves, so it must not claim to be personalised.
    expect(res.body.personalised).toBe(false);
    expect(res.body.entries[0].title).toBe("Shared favourite");
  });

  it("shows the catalogue when nothing has been saved to any list", async () => {
    // A young platform: resources exist, no list has been built yet. The hero
    // must show the real library rather than falling through to the client's
    // hardcoded examples.
    rowsByCall = [
      [],
      [
        {
          id: 11,
          title: "Android Programlama",
          url: "https://tr.wikibooks.org/wiki/Android_Programlama",
          subject: "Okumak",
          savedCount: 0,
        },
      ],
    ];
    const res = await request(buildApp()).get(
      "/api/resources/provenance-showcase",
    );
    expect(res.status).toBe(200);
    expect(res.body.personalised).toBe(false);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({
      title: "Android Programlama",
      host: "tr.wikibooks.org",
      savedCount: 0,
    });
  });

  it("reads the verdict off the URL, the same rule the resource pages use", async () => {
    rows = [
      {
        id: 1,
        title: "University course",
        url: "https://ocw.mit.edu/x",
        subject: null,
        savedCount: 1,
      },
      {
        id: 2,
        title: "Established platform",
        url: "https://www.khanacademy.org/y",
        subject: null,
        savedCount: 1,
      },
      {
        id: 3,
        title: "Someone's blog",
        url: "http://example-blog.test/z",
        subject: null,
        savedCount: 1,
      },
    ];
    const res = await request(buildApp()).get(
      "/api/resources/provenance-showcase",
    );
    const levels = res.body.entries.map(
      (entry: { provenanceLevel: string }) => entry.provenanceLevel,
    );
    expect(levels).toEqual(["institutional", "established", "independent"]);
    // The endpoint makes no outbound request, so it must never claim the link
    // was just checked.
    for (const entry of res.body.entries) {
      expect(entry.provenanceSignals).toContain(
        "Link was not availability-checked",
      );
    }
    expect(res.body.entries[2].provenanceSignals).toContain(
      "Unencrypted HTTP link",
    );
  });

  it("still shows the catalogue when the saves query fails", async () => {
    // The production failure: one try block around the whole chain let an
    // error in the saves tier abort the request before the catalogue tier
    // ran, on a site whose catalogue was full and whose lists were empty.
    failByCall = [new Error("relation \"list_items\" is unavailable")];
    rowsByCall = [
      [],
      [
        {
          id: 21,
          title: "Android Programlama",
          url: "https://tr.wikibooks.org/wiki/Android_Programlama",
          subject: "Okumak",
          savedCount: 0,
        },
      ],
    ];
    const res = await request(buildApp()).get(
      "/api/resources/provenance-showcase",
    );
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].title).toBe("Android Programlama");
  });

  it("reports a failure instead of pretending the catalogue is empty", async () => {
    failWith = new Error("database is away");
    const res = await request(buildApp()).get(
      "/api/resources/provenance-showcase",
    );
    // The hero degrades to its built-in examples on an error response just as
    // it does on an empty one, so the page is fine either way; what matters
    // is that a failure is visible rather than disguised as "no data".
    expect(res.status).toBe(500);
    expect(res.body.entries).toBeUndefined();
  });
});
