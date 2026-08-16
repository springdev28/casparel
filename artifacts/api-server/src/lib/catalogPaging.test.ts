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
import { resolveCatalogOffset, searchCatalog } from "./catalog";

beforeEach(() => {
  selects.length = 0;
  rows = [];
  matchingRows = 0;
});

describe("resolveCatalogOffset", () => {
  it("starts page one at the beginning without counting anything", async () => {
    expect(await resolveCatalogOffset({ query: "algebra", page: 1 })).toBe(0);
    expect(selects).toHaveLength(0);
  });

  it("resumes where the stored catalog ran out instead of overshooting it", async () => {
    // Six rows matched, so page 1 showed all six. A plain (page - 1) * 16
    // would read from row 16 and return nothing, which is what made "Search
    // more resources" do nothing at all.
    matchingRows = 6;
    expect(await resolveCatalogOffset({ query: "algebra", page: 2 })).toBe(6);
  });

  it("pages normally while rows remain", async () => {
    matchingRows = 40;
    expect(await resolveCatalogOffset({ query: "algebra", page: 2 })).toBe(16);
    expect(await resolveCatalogOffset({ query: "algebra", page: 3 })).toBe(32);
  });

  it("pages source mode by the wide window it actually reads", async () => {
    // Source mode reads limit * 4 rows and collapses them to one card per
    // provider. Offsetting by the card count re-read most of the previous
    // page, so a second page of sources was almost entirely duplicates.
    matchingRows = 500;
    expect(
      await resolveCatalogOffset({
        query: "algebra",
        page: 2,
        limit: 12,
        resultType: "source",
      }),
    ).toBe(48);
  });

  it("has nothing to page through for people results", async () => {
    expect(
      await resolveCatalogOffset({
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
    expect(selects).toHaveLength(1);
    expect(selects[0].limit).toBe(16);
    expect(selects[0].offset).toBe(6);
  });

  it("falls back to the page when no offset is given", async () => {
    await searchCatalog({ query: "algebra", page: 3 });
    expect(selects[0].offset).toBe(32);
  });

  it("orders by a unique column so pages cannot overlap", async () => {
    await searchCatalog({ query: "algebra" });
    // Rows are upserted in batches that share last_synced_at. Ordering by it
    // alone left ties for Postgres to break however it liked, so page 2 could
    // hand back rows page 1 had already shown.
    const orderedByRowId = (selects[0].orderBy ?? []).some((term) =>
      ((term as { queryChunks?: unknown[] }).queryChunks ?? []).includes(
        catalogResourcesTable.id,
      ),
    );
    expect(orderedByRowId).toBe(true);
  });

  it("reads the wide window for source results", async () => {
    await searchCatalog({ query: "algebra", limit: 12, resultType: "source" });
    expect(selects[0].limit).toBe(48);
  });
});
