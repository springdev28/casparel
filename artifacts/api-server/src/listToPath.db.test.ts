/**
 * @fileOverview Verification role: exercises List To Path.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A Learning List becomes a goal path, once, in the order it was arranged in.
 *
 * This is the join between organising and studying: the list is already an
 * ordered set of resources the learner chose, so the path is that order and
 * nothing else. What has to be true of the write is what is checked here.
 *
 * It must keep the order. The order is the teaching; a path that reshuffles it
 * is a different path from the one the learner reviewed.
 *
 * It must happen once. Two taps, or a second visit next week, have to find the
 * goal that exists -- otherwise somebody ends up with two paths through the
 * same list and no way to tell which one they have been ticking off. The
 * second answer says so rather than failing, because asking twice is not an
 * error.
 *
 * It must belong to the person who owns the list, and it must refuse an empty
 * list rather than making a goal with no steps in it.
 *
 * And the goal has to remember where it came from, which is both the
 * idempotency key and the provenance the specification asks for -- while
 * outliving the list, because the path is the learner's own work.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

/** Enough to collide, few enough to stay under the pool's ceiling of ten. */
const TAPS = 8;

useExclusiveDatabase();

describe.skipIf(!url)("building a path from a Learning List", () => {
  it("keeps the order, happens once, and belongs to the list's owner", async () => {
    process.env.DATABASE_URL = url;
    const { db, pool, usersTable, resourcesTable, resourceListsTable, listItemsTable, learningGoalsTable } =
      await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    const { default: listsRouter } = await import("./routes/lists.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [learner] = await db
      .insert(usersTable)
      .values({
        email: `list-path-${stamp}@example.test`,
        passwordHash: "x",
        name: "List Path",
        role: "student",
      })
      .returning();
    const [stranger] = await db
      .insert(usersTable)
      .values({
        email: `list-path-stranger-${stamp}@example.test`,
        passwordHash: "x",
        name: "List Path Stranger",
        role: "student",
      })
      .returning();

    const [list] = await db
      .insert(resourceListsTable)
      .values({
        name: `Mechanics, in order ${stamp}`,
        description: "The order I mean to work through them.",
        ownerId: learner.id,
        workspaceRole: "student",
      })
      .returning();
    const [empty] = await db
      .insert(resourceListsTable)
      .values({ name: `Nothing yet ${stamp}`, ownerId: learner.id, workspaceRole: "student" })
      .returning();

    /*
     * Three resources, added in one order and arranged in another: position is
     * what the path must follow, not the order they were saved in.
     */
    const titles = ["Read the chapter", "Watch the derivation", "Do the problems"];
    const resourceIds: number[] = [];
    for (const [index, title] of titles.entries()) {
      const [resource] = await db
        .insert(resourcesTable)
        .values({
          title: `${title} ${stamp}`,
          url: `https://example.test/path-${index}-${stamp}`,
          format: "article",
          // The second one is the odd subject out, so the goal's subject is a
          // real majority rather than whichever happened to be first.
          subject: index === 1 ? "Mathematics" : "Physics",
          gradeLevel: "Year 12",
          submittedById: learner.id,
        })
        .returning();
      resourceIds.push(resource.id);
    }
    await db.insert(listItemsTable).values([
      { listId: list.id, resourceId: resourceIds[0], position: 0 },
      { listId: list.id, resourceId: resourceIds[1], position: 1 },
      { listId: list.id, resourceId: resourceIds[2], position: 2 },
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api", listsRouter);
    const learnerAuth = {
      Authorization: `Bearer ${issueToken(learner.id, learner.role, learner.activeRole)}`,
    };
    const strangerAuth = {
      Authorization: `Bearer ${issueToken(stranger.id, stranger.role, stranger.activeRole)}`,
    };

    const build = (listId: number, auth: Record<string, string>, body?: object) =>
      request(app).post(`/api/lists/${listId}/path`).set(auth).send(body ?? {});

    // ── the path is the list, in the list's order ────────────────────────────
    const first = await build(list.id, learnerAuth);
    expect(first.status, first.text.slice(0, 200)).toBe(201);
    expect(first.body.alreadyBuilt).toBe(false);
    expect(first.body.pathSteps.map((step: { resourceId: number }) => step.resourceId)).toEqual(
      resourceIds,
    );
    expect(first.body.pathSteps[0].title).toBe(`Read the chapter ${stamp}`);
    expect(first.body.pathSteps.every((step: { completed: boolean }) => !step.completed)).toBe(true);
    // The list's own words carry over; nothing about the goal is invented.
    expect(first.body.title).toBe(list.name);
    expect(first.body.description).toBe(list.description);
    expect(first.body.subject).toBe("Physics");
    expect(first.body.sourceListId).toBe(list.id);

    // ── asking again finds the path that exists ──────────────────────────────
    const again = await build(list.id, learnerAuth);
    expect(again.status, again.text.slice(0, 200)).toBe(200);
    expect(again.body.alreadyBuilt).toBe(true);
    expect(again.body.id).toBe(first.body.id);

    // ── a title given by the learner is used, but does not make a second ─────
    const renamed = await build(list.id, learnerAuth, { title: "My own name for it" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.id).toBe(first.body.id);
    expect(renamed.body.title).toBe(list.name);

    // ── an empty list is refused, rather than becoming a goal with no steps ──
    const nothing = await build(empty.id, learnerAuth);
    expect(nothing.status, nothing.text.slice(0, 200)).toBe(400);
    const emptyGoals = await db
      .select({ id: learningGoalsTable.id })
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.sourceListId, empty.id));
    expect(emptyGoals).toHaveLength(0);

    // ── somebody else's list is not theirs to build from ─────────────────────
    const theirs = await build(list.id, strangerAuth);
    expect([403, 404]).toContain(theirs.status);
    const strangersGoals = await db
      .select({ id: learningGoalsTable.id })
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.userId, stranger.id));
    expect(strangersGoals).toHaveLength(0);

    // ── eight taps on a fresh list leave one path ────────────────────────────
    const [raced] = await db
      .insert(resourceListsTable)
      .values({ name: `Tapped ${stamp}`, ownerId: learner.id, workspaceRole: "student" })
      .returning();
    await db
      .insert(listItemsTable)
      .values({ listId: raced.id, resourceId: resourceIds[0], position: 0 });

    // Warm, or the race does not happen: on a cold pool the first request
    // finishes before the others have opened a socket.
    const held = await Promise.all(Array.from({ length: TAPS }, () => pool.connect()));
    for (const client of held) client.release();

    const taps = await Promise.all(
      Array.from({ length: TAPS }, () => build(raced.id, learnerAuth)),
    );
    expect(
      taps.filter((tap) => tap.status >= 500).map((tap) => tap.text.slice(0, 160)),
    ).toEqual([]);
    expect(taps.filter((tap) => tap.status === 201)).toHaveLength(1);
    expect(taps.filter((tap) => tap.status === 200)).toHaveLength(TAPS - 1);
    const racedGoals = await db
      .select({ id: learningGoalsTable.id })
      .from(learningGoalsTable)
      .where(
        and(
          eq(learningGoalsTable.userId, learner.id),
          eq(learningGoalsTable.sourceListId, raced.id),
        ),
      );
    expect(racedGoals).toHaveLength(1);

    // ── a role is the learner's own note about the part an item plays ───────
    const [firstItem] = await db
      .select({ id: listItemsTable.id })
      .from(listItemsTable)
      .where(eq(listItemsTable.listId, list.id));
    const labelled = await request(app)
      .patch(`/api/lists/${list.id}/items/${firstItem.id}`)
      .set(learnerAuth)
      .send({ role: "practice" });
    expect(labelled.status, labelled.text.slice(0, 200)).toBe(200);
    expect(labelled.body.role).toBe("practice");
    expect(labelled.body.resource?.title).toContain("Read the chapter");

    const cleared = await request(app)
      .patch(`/api/lists/${list.id}/items/${firstItem.id}`)
      .set(learnerAuth)
      .send({ role: null });
    expect(cleared.status, cleared.text.slice(0, 200)).toBe(200);
    expect(cleared.body.role).toBeNull();

    const theirLabel = await request(app)
      .patch(`/api/lists/${list.id}/items/${firstItem.id}`)
      .set(strangerAuth)
      .send({ role: "reference" });
    expect([403, 404]).toContain(theirLabel.status);

    // ── and the path outlives the list it came from ──────────────────────────
    await db.delete(resourceListsTable).where(eq(resourceListsTable.id, raced.id));
    const [survivor] = await db
      .select()
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.id, racedGoals[0].id));
    expect(survivor, "deleting the list must not delete the path").toBeTruthy();
    expect(survivor.sourceListId, "only the provenance goes").toBeNull();
    expect(survivor.pathSteps).toHaveLength(1);
  });
});
