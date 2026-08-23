/**
 * @fileOverview Verification role: exercises Catalog Paging.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Paging over the stored open-education catalog.
 *
 * These cover the reads behind "Search more resources": where a later page
 * starts, how wide a window it reads, and that the order it pages over is
 * total. The database is faked — the assertions are about the query that
 * would be sent, not about Postgres.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectRecord = {
  projection: unknown;
  limit?: number;
  offset?: number;
  orderBy?: unknown[];
};

const selects: SelectRecord[] = [];
/** Rows the next row-returning select resolves with. */
let rows: unknown[] = [];
/** Value the next count select resolves with. */
let matchingRows = 0;

vi.mock("@workspace/db", async () => {
  // Real tables and columns, faked connection: the assertions are about the
  // query drizzle builds, so the columns have to be the genuine ones.
  const actual =
    await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  // Drizzle's own sql helper, for the aliased subquery columns below. It is not
  // re-exported by @workspace/db.
  const { sql } =
    await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");

  function chain(record: SelectRecord) {
    const isCount =
      typeof record.projection === "object" &&
      record.projection !== null &&
      "count" in record.projection;
    const builder = {
      from: () => builder,
      where: () => builder,
      orderBy: (...order: unknown[]) => {
        record.orderBy = order;
        return builder;
      },
      limit: (value: number) => {
        record.limit = value;
        return builder;
      },
      offset: (value: number) => {
        record.offset = value;
        return builder;
      },
      // The ranking is computed in a subquery so each source's band can be, and
      // the outer query pages over it. A fake that cannot be aliased would fail
      // every test here for a reason that has nothing to do with paging.
      as: (name: string) =>
        new Proxy(
          {},
          {
            get: (_target, property) =>
              sql.raw(`"${name}"."${String(property)}"`),
          },
        ),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        try {
          return Promise.resolve(
            resolve(isCount ? [{ count: matchingRows }] : rows),
          );
        } catch (error) {
          return reject ? Promise.resolve(reject(error)) : Promise.reject(error);
        }
      },
    };
    return builder;
  }

  return {
    ...actual,
    db: {
      select: (projection?: unknown) => {
        const record: SelectRecord = { projection };
        selects.push(record);
        return chain(record);
      },
    },
  };
});

import { catalogResourcesTable } from "@workspace/db";
import {
  catalogCursor,
  parseCatalogCursor,
  resolveCatalogSearch,
  searchCatalog,
} from "./catalog";

/** The offset half of the resolution, which is what these cover. */
const resolveCatalogSearchOffset = async (
  options: Parameters<typeof resolveCatalogSearch>[0],
) => (await resolveCatalogSearch(options)).offset;

beforeEach(() => {
  selects.length = 0;
  rows = [];
  matchingRows = 0;
});

describe("resolveCatalogSearch", () => {
  it("starts page one at the beginning", async () => {
    expect(await resolveCatalogSearchOffset({ query: "algebra", page: 1 })).toBe(0);
  });

  it("relaxes a long query only when nothing matches strictly", async () => {
    // Strictness belongs to the query, not the page. Deciding it per page is
    // what made page three re-read page two: page one matched strictly and
    // stopped, later pages found none, relaxed, and each read the same loose
    // rows from an offset measured against the strict set.
    matchingRows = 4;
    const strict = await resolveCatalogSearch({
      query: "ap physics electricity mechanics",
      page: 1,
    });
    expect(strict.minRelevanceScore).toBe(2);

    matchingRows = 0;
    const relaxed = await resolveCatalogSearch({
      query: "ap physics electricity mechanics",
      page: 1,
    });
    expect(relaxed.minRelevanceScore).toBe(1);
  });

  it("resumes where the stored catalog ran out instead of overshooting it", async () => {
    // Six rows matched, so page 1 showed all six. A plain (page - 1) * 16
    // would read from row 16 and return nothing, which is what made "Search
    // more resources" do nothing at all.
    matchingRows = 6;
    expect(await resolveCatalogSearchOffset({ query: "algebra", page: 2 })).toBe(6);
  });

  it("pages normally while rows remain", async () => {
    matchingRows = 40;
    expect(await resolveCatalogSearchOffset({ query: "algebra", page: 2 })).toBe(16);
    expect(await resolveCatalogSearchOffset({ query: "algebra", page: 3 })).toBe(32);
  });

  it("pages source mode by the wide window it actually reads", async () => {
    // Source mode reads limit * 4 rows and collapses them to one card per
    // provider. Offsetting by the card count re-read most of the previous
    // page, so a second page of sources was almost entirely duplicates.
    matchingRows = 500;
    expect(
      await resolveCatalogSearchOffset({
        query: "algebra",
        page: 2,
        limit: 12,
        resultType: "source",
      }),
    ).toBe(48);
  });

  it("has nothing to page through for people results", async () => {
    expect(
      await resolveCatalogSearchOffset({
        query: "ada lovelace",
        page: 3,
        resultType: "people",
      }),
    ).toBe(0);
    expect(selects).toHaveLength(0);
  });
});

describe("searchCatalog", () => {
  it("reads one page at the caller's offset", async () => {
    await searchCatalog({ query: "algebra", page: 2, offset: 6 });
    // Two selects now: the ranking, and the page taken from it.
    expect(selects.at(-1)!.limit).toBe(16);
    expect(selects.at(-1)!.offset).toBe(6);
  });

  it("falls back to the page when no offset is given", async () => {
    await searchCatalog({ query: "algebra", page: 3 });
    expect(selects.at(-1)!.offset).toBe(32);
  });

  it("orders by the band first, then relevance, then a unique column", async () => {
    await searchCatalog({ query: "algebra" });
    // The band is what stops one source owning the page, and it has to come
    // first or relevance chooses the window before the interleaving is applied.
    // Rows are upserted in batches sharing last_synced_at, so the row id is the
    // final tie-break: ordering by the timestamp left ties for Postgres to break
    // however it liked and page 2 could repeat page 1.
    const order = (selects.at(-1)!.orderBy ?? []).map((term) =>
      JSON.stringify(term),
    );
    expect(order).toHaveLength(4);
    expect(order[0]).toContain("band");
    expect(order.at(-1)).toContain("id");
  });

  it("reads the wide window for source results", async () => {
    await searchCatalog({ query: "algebra", limit: 12, resultType: "source" });
    expect(selects.at(-1)!.limit).toBe(48);
  });

  it("reads from the start when the caller gives a cursor instead of a page", async () => {
    // A cursor names a place in the ranking, so it goes in the WHERE clause.
    // Keeping the page's offset as well would skip a page's worth of results
    // past the place the reader actually stopped.
    await searchCatalog({
      query: "algebra",
      page: 4,
      after: catalogCursor(0, 2, 1, 91),
    });
    expect(selects.at(-1)!.offset).toBe(0);
  });

  it("ignores a cursor it did not write", async () => {
    await searchCatalog({ query: "algebra", page: 3, after: "../../etc/passwd" });
    expect(selects.at(-1)!.offset).toBe(32);
  });
});

describe("catalogCursor", () => {
  it("survives a round trip", () => {
    expect(parseCatalogCursor(catalogCursor(3, 6, 2, 12345))).toEqual({
      band: 3,
      score: 6,
      relevance: 2,
      id: 12345,
    });
  });

  it("sorts as text in the order the results are ranked", () => {
    // The client holds a page it has reordered and filtered, and finds how far
    // it has read by taking the largest cursor. That only works if plain text
    // comparison is the ranking comparison: band ascending, then score
    // descending, then relevance ascending, then row id ascending. The band
    // leading means a source's second helping sorts after everyone's first,
    // however relevant it is.
    const ranked = [
      catalogCursor(0, 6, 0, 4), // first band, best score
      catalogCursor(0, 6, 1, 2),
      catalogCursor(0, 2, 0, 1),
      catalogCursor(1, 9, 0, 5), // a second helping from some source
      catalogCursor(1, 1, 3, 900), // weakest
    ];
    expect([...ranked].sort()).toEqual(ranked);
    expect(ranked.reduce((a, b) => (a > b ? a : b))).toBe(ranked.at(-1));
  });

  it("refuses anything it did not write", () => {
    for (const value of [
      undefined,
      "",
      "0",
      "00.9997.1.1",
      "ab.9997.1.000000000001",
      "00.9997.1.000000000001; drop table",
      // A cursor from before the band existed. Reinterpreting it would name a
      // different place in a different order, so it is refused and the request
      // falls back to positional paging.
      "9997.1.000000000001",
    ])
      expect(parseCatalogCursor(value)).toBeNull();
  });

  it("clamps rather than producing a cursor that sorts wrongly", () => {
    // A score above the ceiling or a negative id would otherwise widen the
    // field and break text ordering for every other cursor.
    expect(catalogCursor(1e9, 1e9, 99, -5)).toBe("99.0000.9.000000000000");
    expect(catalogCursor(-1, -1, 0, 1)).toBe("00.9999.0.000000000001");
  });
});
