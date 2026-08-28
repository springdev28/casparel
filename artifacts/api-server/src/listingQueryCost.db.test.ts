/**
 * @fileOverview Verification role: exercises Listing Query Cost.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A listing costs the same whether it holds three rows or thirty.
 *
 * Three endpoints had the same defect, and all three are a screen somebody
 * opens: a Learning List, the classes tab, and the messages inbox.
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
 * The conversations listing was the worst of them -- the other person, the
 * last message and the unread count, asked separately, per conversation, for
 * up to the hundred the route allows itself.
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

describe.skipIf(!url)("reading the classes and messages listings", () => {
  it("does not spend a query per row either", async () => {
    process.env.DATABASE_URL = url;
    const {
      db,
      pool,
      usersTable,
      classesTable,
      classMembersTable,
      directConversationsTable,
      directMessagesTable,
    } = await import("@workspace/db");
    const { default: classesRouter } = await import("./routes/classes.js");
    const { default: messagesRouter } = await import("./routes/directMessages.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [teacher] = await db
      .insert(usersTable)
      .values({
        email: `listing-cost-${stamp}@example.test`,
        passwordHash: "x",
        name: "Listing Cost",
        role: "teacher",
        activeRole: "teacher",
      })
      .returning();

    /** Classes, each with one member, so the count query has rows to group. */
    for (let index = 0; index < 12; index += 1) {
      const [cls] = await db
        .insert(classesTable)
        .values({
          name: `Cost ${index} ${stamp}`,
          subject: "Physics",
          gradeLevel: "Year 12",
          teacherId: teacher.id,
        })
        .returning();
      await db
        .insert(classMembersTable)
        .values({ classId: cls.id, userId: teacher.id, role: "teacher" });
    }

    /** Conversations, each with a message in it and one unread reply. */
    for (let index = 0; index < 12; index += 1) {
      const [other] = await db
        .insert(usersTable)
        .values({
          email: `listing-other-${index}-${stamp}@example.test`,
          passwordHash: "x",
          name: `Other ${index}`,
          role: "student",
        })
        .returning();
      const [conversation] = await db
        .insert(directConversationsTable)
        .values({
          firstUserId: teacher.id,
          secondUserId: other.id,
          requestedById: other.id,
          status: "accepted",
        })
        .returning();
      await db.insert(directMessagesTable).values({
        conversationId: conversation.id,
        senderId: other.id,
        body: `Message ${index}`,
      });
    }

    const app = express();
    app.use(express.json());
    app.use("/api", classesRouter);
    app.use("/api", messagesRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(teacher.id, teacher.role, teacher.activeRole)}`,
    };

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

    const classes = await queriesFor("/api/classes");
    expect(classes.body).toHaveLength(12);
    // Still the whole answer: the member count is what the fan-out was for.
    expect(classes.body[0].memberCount).toBe(1);
    expect(
      classes.count,
      `listing 12 classes took ${classes.count} queries; it should be a fixed ` +
        `handful however many there are`,
    ).toBeLessThanOrEqual(6);

    const conversations = await queriesFor("/api/direct-messages/conversations");
    expect(conversations.body).toHaveLength(12);
    // The three things the inbox draws, all still there.
    expect(conversations.body[0].other?.name).toMatch(/^Other /);
    expect(conversations.body[0].lastMessage?.body).toMatch(/^Message /);
    expect(conversations.body[0].unreadCount).toBe(1);
    expect(
      conversations.count,
      `listing 12 conversations took ${conversations.count} queries; it was ` +
        `three per conversation before and should now be a fixed handful`,
    ).toBeLessThanOrEqual(6);
  });
});
