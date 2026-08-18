/**
 * Correcting the subject on videos that are already stored.
 *
 * The classifier only ever ran at import time, so improving it fixed nothing
 * already in the catalog — and a video is re-imported only when a search runs
 * thin enough to ask the providers again, which a well-answered question never
 * does. "History Summarized: The Punic Wars" is exactly that case: the search
 * that shows it filed under Literature is the search that never re-imports it.
 *
 * Against a real Postgres, because the point is the UPDATE landing on the right
 * rows and the ordering that stops one batch being asked about forever. YouTube
 * itself is stubbed: what is being checked here is the correction, not the
 * classification, which openSources.test.ts covers against real payloads.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

useExclusiveDatabase();

async function database() {
  process.env.DATABASE_URL = url;
  const db = await import("@workspace/db");
  await db.runMigrations();
  return db;
}

/** A stored video, as the importer would have left it. */
function video(index: number, subject: string, syncedAt: string) {
  return {
    provider: "YouTube",
    providerUrl: "https://www.youtube.com/",
    externalId: `youtube:vid${index}`,
    canonicalUrl: `https://www.youtube.com/watch?v=vid${index}`,
    title: `Video ${index}`,
    description: "A stored video.",
    format: "video" as const,
    subject,
    gradeLevel: "All levels",
    sourceKind: "youtube" as const,
    metadata: { material: "video" },
    lastSyncedAt: syncedAt,
  };
}

/** What videos.list would answer, for the ids it was actually asked about. */
function answer(subjectsById: Record<string, { tags: string[] }>) {
  return (endpoint: URL | string) => {
    const asked = new URL(String(endpoint)).searchParams.get("id")!.split(",");
    return {
      ok: true,
      json: async () => ({
        items: asked
          .filter((id) => subjectsById[id])
          .map((id) => ({
            id,
            snippet: {
              categoryId: "27",
              title: `Video ${id}`,
              tags: subjectsById[id].tags,
            },
          })),
      }),
    } as unknown as Response;
  };
}

describe.skipIf(!url)("correcting stored video subjects", () => {
  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = "test-key-not-real";
    delete process.env.CATALOG_REMOTE_SEARCH_ENABLED;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.YOUTUBE_API_KEY;
  });

  it("replaces a subject the video's own tags do not support", async () => {
    const { db, catalogResourcesTable } = await database();
    await db.delete(catalogResourcesTable);
    await db
      .insert(catalogResourcesTable)
      .values([video(1, "Literature", "2020-01-01T00:00:00.000Z")]);

    const { refreshStoredVideoSubjects, clearProviderCooldowns } = await import(
      "./lib/catalog"
    );
    clearProviderCooldowns();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      answer({ vid1: { tags: ["ap chemistry", "chemistry"] } }) as never,
    );

    expect(await refreshStoredVideoSubjects()).toBe(1);
    const [row] = await db.select().from(catalogResourcesTable);
    expect(row.subject).toBe("Chemistry");
  });

  it("resets a video whose tags turn out to say nothing", async () => {
    // The Punic Wars case. The new answer is the authoritative one, including
    // when the new answer is that the video never said.
    const { db, catalogResourcesTable } = await database();
    await db.delete(catalogResourcesTable);
    await db
      .insert(catalogResourcesTable)
      .values([video(2, "Literature", "2020-01-01T00:00:00.000Z")]);

    const { refreshStoredVideoSubjects, clearProviderCooldowns } = await import(
      "./lib/catalog"
    );
    clearProviderCooldowns();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      answer({ vid2: { tags: ["online learning", "video tutorial"] } }) as never,
    );

    expect(await refreshStoredVideoSubjects()).toBe(1);
    const [row] = await db.select().from(catalogResourcesTable);
    expect(row.subject).toBe("Interdisciplinary");
  });

  it("works through the catalog rather than the same rows forever", async () => {
    // Every row is stamped as checked, corrected or not. Without that the
    // oldest fifty are asked about on every pass and the rest never are.
    const { db, catalogResourcesTable } = await database();
    await db.delete(catalogResourcesTable);
    await db
      .insert(catalogResourcesTable)
      .values([
        video(3, "Interdisciplinary", "2020-01-01T00:00:00.000Z"),
        video(4, "Interdisciplinary", "2021-01-01T00:00:00.000Z"),
      ]);

    const { refreshStoredVideoSubjects, clearProviderCooldowns } = await import(
      "./lib/catalog"
    );
    clearProviderCooldowns();
    const asked: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(((endpoint: URL) => {
      asked.push(new URL(String(endpoint)).searchParams.get("id")!);
      return answer({})(endpoint);
    }) as never);

    await refreshStoredVideoSubjects(1);
    await refreshStoredVideoSubjects(1);
    // The older row first, then the other one — not the same row twice.
    expect(asked).toEqual(["vid3", "vid4"]);
  });

  it("does not ask at all without a key", async () => {
    const { db, catalogResourcesTable } = await database();
    await db.delete(catalogResourcesTable);
    await db
      .insert(catalogResourcesTable)
      .values([video(5, "Literature", "2020-01-01T00:00:00.000Z")]);

    delete process.env.YOUTUBE_API_KEY;
    const { refreshStoredVideoSubjects } = await import("./lib/catalog");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await refreshStoredVideoSubjects()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves everything alone when the lookup fails", async () => {
    // A refresh that cannot reach YouTube must not wipe subjects that are
    // already correct.
    const { db, catalogResourcesTable } = await database();
    await db.delete(catalogResourcesTable);
    await db
      .insert(catalogResourcesTable)
      .values([video(6, "Chemistry", "2020-01-01T00:00:00.000Z")]);

    const { refreshStoredVideoSubjects, clearProviderCooldowns } = await import(
      "./lib/catalog"
    );
    clearProviderCooldowns();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    expect(await refreshStoredVideoSubjects()).toBe(0);
    const [row] = await db.select().from(catalogResourcesTable);
    expect(row.subject).toBe("Chemistry");
  });
});
