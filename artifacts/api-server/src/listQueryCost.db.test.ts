/**
 * @fileOverview Verification role: exercises List Query Cost.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Opening a Learning List costs the same whether it holds three or thirty.
 *
 * It did not. `GET /lists/:id` ran one query for each item's resource row and
 * another for that resource's rating summary, so a twelve-item list was
 * twenty-five round trips; `GET /lists` re-selected each list row the handler
 * was already holding and then counted its items, two per list. Round trips
 * are what these endpoints cost -- the database is not in the same process --
 * and the pool is ten connections wide, so a fan-out queues behind itself as
 * soon as more than one person is reading.
 *
 * The phone's Learning List screen opens exactly these two endpoints, which is
 * what turned a known-slow shape into something somebody waits for on a train.
 *
 * Counting queries rather than timing them: a timing threshold on a laptop
 * says nothing about a deployment, and the defect is not "slow", it is "grows
 * with the number of items". Three items and thirty must cost the same.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

useExclusiveDatabase();

describe.skipIf(!url)("reading Learning Lists", () => {
  it("does not spend a query per item", async () => {
    process.env.DATABASE_URL = url;
    const { db, pool, usersTable, resourcesTable, resourceListsTable, listItemsTable } =
      await import("@workspace/db");
    const { default: listsRouter } = await import("./routes/lists.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [owner] = await db
      .insert(usersTable)
      .values({
        email: `list-cost-${stamp}@example.test`,
        passwordHash: "x",
        name: "List Cost",
        role: "student",
      })
      .returning();

    /** A list with `size` resources in it. */
    async function listOf(size: number, tag: string) {
      const [list] = await db
        .insert(resourceListsTable)
        .values({ name: `${tag} ${stamp}`, ownerId: owner.id, workspaceRole: "student" })
        .returning();
      for (let index = 0; index < size; index += 1) {
        const [resource] = await db
          .insert(resourcesTable)
          .values({
            title: `${tag} resource ${index} ${stamp}`,
            url: `https://example.test/${tag}-${index}-${stamp}`,
            format: "article",
            subject: "Physics",
            gradeLevel: "Year 12",
            submittedById: owner.id,
          })
          .returning();
        await db
          .insert(listItemsTable)
          .values({ listId: list.id, resourceId: resource.id, position: index });
      }
      return list;
    }

    const small = await listOf(3, "small");
    const large = await listOf(30, "large");

    const app = express();
    app.use(express.json());
    app.use("/api", listsRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(owner.id, owner.role, owner.activeRole)}`,
    };

    /**
     * How many queries one request makes.
     *
     * Counted at the pool, which is where a round trip actually is. Restored
     * afterwards so a failure here cannot leak into the next file.
     */
    const original = pool.query.bind(pool);
    async function queriesFor(path: string) {
      let count = 0;
      (pool as { query: unknown }).query = (...args: unknown[]) => {
        count += 1;
        return (original as (...a: unknown[]) => unknown)(...args);
      };
      try {
        const response = await request(app).get(path).set(auth);
        expect(response.status, response.text.slice(0, 200)).toBe(200);
        return { count, body: response.body };
      } finally {
        (pool as { query: unknown }).query = original;
      }
    }

    const three = await queriesFor(`/api/lists/${small.id}`);
    const thirty = await queriesFor(`/api/lists/${large.id}`);

    expect(three.body.items).toHaveLength(3);
    expect(thirty.body.items).toHaveLength(30);
    // Every item still carries the resource and its rating summary; a cheaper
    // endpoint that stopped answering the question would pass a bare count.
    expect(thirty.body.items[0].resource.title).toContain("large resource 0");
    expect(thirty.body.items[0].resource.avgRating).toBe(0);
    expect(thirty.body.items[0].resource.reviewCount).toBe(0);

    expect(
      thirty.count,
      `reading a 30-item list took ${thirty.count} queries against ` +
        `${three.count} for a 3-item one, so the cost is still per item`,
    ).toBe(three.count);

    // The listing has the same shape of defect and the same fix.
    const listing = await queriesFor("/api/lists");
    expect(listing.body.length).toBeGreaterThanOrEqual(2);
    expect(
      listing.body.find((row: { id: number }) => row.id === large.id)?.itemCount,
    ).toBe(30);
    expect(
      listing.count,
      `listing ${listing.body.length} lists took ${listing.count} queries; it ` +
        `should be a fixed handful however many there are`,
    ).toBeLessThanOrEqual(6);
  });
});
