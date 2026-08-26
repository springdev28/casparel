/**
 * @fileOverview Verification role: exercises List Order.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A reordered Learning List arrives in the order asked for, whole.
 *
 * A Learning List is an ordered set rather than a folder: the order is the
 * teaching, so it is the thing the write has to get right. It was persisted as
 * one UPDATE per item in a Promise.all, outside any transaction, after a check
 * that had read the items in a statement of its own. Two failure modes came
 * out of that, and neither is visible from the app afterwards: a failure
 * part-way through leaves some items renumbered and some not, with two of them
 * sharing a position and the tie broken by insertion time; and an item removed
 * on another device between the check and the writes means the order that was
 * validated is not the order that was written.
 *
 * It is one transaction and one statement now, and this is what that promises.
 * The reorder is also the write the phone's list screen depends on, which is
 * why it is checked against a real database rather than a mock that would
 * return whatever it was handed.
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

describe.skipIf(!url)("reordering a Learning List", () => {
  it("writes the order asked for, and refuses one that is not a permutation", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable, resourcesTable, resourceListsTable, listItemsTable } =
      await import("@workspace/db");
    const { asc, eq } = await import("drizzle-orm");
    const { default: listsRouter } = await import("./routes/lists.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [owner] = await db
      .insert(usersTable)
      .values({
        email: `list-order-${stamp}@example.test`,
        passwordHash: "x",
        name: "List Order",
        role: "student",
      })
      .returning();

    const [list] = await db
      .insert(resourceListsTable)
      .values({ name: `Ordered ${stamp}`, ownerId: owner.id, workspaceRole: "student" })
      .returning();
    const [otherList] = await db
      .insert(resourceListsTable)
      .values({ name: `Another ${stamp}`, ownerId: owner.id, workspaceRole: "student" })
      .returning();
    const [empty] = await db
      .insert(resourceListsTable)
      .values({ name: `Empty ${stamp}`, ownerId: owner.id, workspaceRole: "student" })
      .returning();

    // Annotated, because the position of the next row is read off this array
    // while it is still being built and would otherwise infer as `any`.
    const items: Array<{ id: number }> = [];
    for (const title of ["First", "Second", "Third"]) {
      const [resource] = await db
        .insert(resourcesTable)
        .values({
          title: `${title} ${stamp}`,
          url: `https://example.test/${title.toLowerCase()}-${stamp}`,
          format: "article",
          subject: "Physics",
          gradeLevel: "Year 12",
          submittedById: owner.id,
        })
        .returning();
      const [item] = await db
        .insert(listItemsTable)
        .values({ listId: list.id, resourceId: resource.id, position: items.length })
        .returning();
      items.push(item);
    }
    const [strayResource] = await db
      .insert(resourcesTable)
      .values({
        title: `Stray ${stamp}`,
        url: `https://example.test/stray-${stamp}`,
        format: "article",
        subject: "Physics",
        gradeLevel: "Year 12",
        submittedById: owner.id,
      })
      .returning();
    const [strayItem] = await db
      .insert(listItemsTable)
      .values({ listId: otherList.id, resourceId: strayResource.id, position: 0 })
      .returning();

    const app = express();
    app.use(express.json());
    app.use("/api", listsRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(owner.id, owner.role, owner.activeRole)}`,
    };

    const reorder = (listId: number, itemIds: number[]) =>
      request(app).post(`/api/lists/${listId}/items/reorder`).set(auth).send({ itemIds });

    const positions = async (listId: number) =>
      (
        await db
          .select({ id: listItemsTable.id })
          .from(listItemsTable)
          .where(eq(listItemsTable.listId, listId))
          .orderBy(asc(listItemsTable.position), asc(listItemsTable.addedAt))
      ).map((row) => row.id);

    // ── the order asked for is the order stored ──────────────────────────────
    const wanted = [items[2].id, items[0].id, items[1].id];
    const moved = await reorder(list.id, wanted);
    expect(moved.status, moved.text.slice(0, 200)).toBe(204);
    expect(await positions(list.id)).toEqual(wanted);
    // Positions are 0,1,2 rather than three rows that merely sort correctly:
    // a tie broken by insertion time reads as the right order until something
    // is added to the list.
    const stored = await db
      .select({ id: listItemsTable.id, position: listItemsTable.position })
      .from(listItemsTable)
      .where(eq(listItemsTable.listId, list.id))
      .orderBy(asc(listItemsTable.position));
    expect(stored.map((row) => row.position)).toEqual([0, 1, 2]);

    // ── and it is what the app reads back ────────────────────────────────────
    const read = await request(app).get(`/api/lists/${list.id}`).set(auth);
    expect(read.status, read.text.slice(0, 200)).toBe(200);
    expect(read.body.items.map((item: { id: number }) => item.id)).toEqual(wanted);

    // ── a short order is refused, and changes nothing ────────────────────────
    const short = await reorder(list.id, [items[0].id, items[1].id]);
    expect(short.status).toBe(400);
    expect(await positions(list.id)).toEqual(wanted);

    // ── so is one carrying somebody else's list item ─────────────────────────
    const foreign = await reorder(list.id, [items[0].id, items[1].id, strayItem.id]);
    expect(foreign.status).toBe(400);
    expect(await positions(list.id)).toEqual(wanted);
    // The stray item is still where it was, in the list it belongs to.
    expect(await positions(otherList.id)).toEqual([strayItem.id]);

    // ── a duplicate is refused rather than silently collapsing two rows ──────
    const duplicated = await reorder(list.id, [items[0].id, items[0].id, items[1].id]);
    expect(duplicated.status).toBe(400);
    expect(await positions(list.id)).toEqual(wanted);

    // ── an empty list is already in the order it was asked for ───────────────
    const nothing = await reorder(empty.id, []);
    expect(nothing.status, nothing.text.slice(0, 200)).toBe(204);
  });
});
