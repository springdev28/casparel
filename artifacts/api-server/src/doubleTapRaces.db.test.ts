/**
 * @fileOverview Verification role: exercises Double Tap Races.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Pressing a button twice does not produce a 500.
 *
 * Several handlers read a row and then inserted one when the read found none,
 * against a column the schema declares unique. That is fine until the two
 * halves overlap, and they overlap whenever somebody taps twice -- which is
 * what people do to a like, and what they do to any button when the first tap
 * seems not to have landed. Both reads find nothing, both insert, and the
 * loser gets `duplicate key value violates unique constraint` as a 500.
 *
 *   • liking a post or a material   (forum_like_unique)
 *   • reposting a post              (forum_post_reposts_user_post_unique)
 *   • recommending a resource to a class
 *                                   (class_resource_recommendations_pending_unique)
 *   • saving a resource to a learner library
 *   • adding a resource to a Learning List
 *
 * Found by looking for the shape after `ensureCalendarTokenRow` turned out to
 * have it. These are the three that were left; every other insert against a
 * unique index already said what to do on a conflict.
 *
 * The pool has to be warm or none of it reproduces: on a cold one the first
 * request finishes its whole read-and-insert while the others are still
 * opening sockets, so they all take the "already there" branch and the run is
 * green against the broken code. A live server has warm connections.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

/** Enough to collide, few enough to stay under the pool's ceiling of ten. */
const TAPS = 8;

useExclusiveDatabase();

describe.skipIf(!url)("tapping a button twice", () => {
  it("never answers with a 500", async () => {
    process.env.DATABASE_URL = url;
    const {
      db,
      pool,
      usersTable,
      classesTable,
      classMembersTable,
      resourcesTable,
      resourceListsTable,
      listItemsTable,
      forumPostsTable,
    } = await import("@workspace/db");
    const { default: forumRouter } = await import("./routes/forum.js");
    const { default: classesRouter } = await import("./routes/classes.js");
    const { default: resourcesRouter } = await import("./routes/resources.js");
    const { default: listsRouter } = await import("./routes/lists.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [student] = await db
      .insert(usersTable)
      .values({
        email: `double-tap-${stamp}@example.test`,
        passwordHash: "x",
        name: "Double Tap",
        role: "student",
      })
      .returning();
    const [teacher] = await db
      .insert(usersTable)
      .values({
        email: `double-tap-teacher-${stamp}@example.test`,
        passwordHash: "x",
        name: "Double Tap Teacher",
        role: "teacher",
        activeRole: "teacher",
      })
      .returning();

    const [cls] = await db
      .insert(classesTable)
      .values({
        name: `Double tap ${stamp}`,
        subject: "Physics",
        gradeLevel: "Year 12",
        teacherId: teacher.id,
      })
      .returning();
    await db.insert(classMembersTable).values({ classId: cls.id, userId: student.id, role: "student" });

    const [resource] = await db
      .insert(resourcesTable)
      .values({
        title: `Double tap resource ${stamp}`,
        url: `https://example.test/double-tap-${stamp}`,
        format: "article",
        subject: "Physics",
        gradeLevel: "Year 12",
        submittedById: student.id,
      })
      .returning();
    const [list] = await db
      .insert(resourceListsTable)
      .values({
        name: `Double tap list ${stamp}`,
        ownerId: student.id,
        workspaceRole: "student",
      })
      .returning();

    const [post] = await db
      .insert(forumPostsTable)
      .values({
        authorId: student.id,
        authorName: "Double Tap",
        authorRole: "student",
        title: `Double tap post ${stamp}`,
        body: "Something to like.",
      })
      .returning();

    const app = express();
    app.use(express.json());
    app.use("/api", forumRouter);
    app.use("/api", classesRouter);
    app.use("/api", resourcesRouter);
    app.use("/api", listsRouter);
    const auth = { Authorization: `Bearer ${issueToken(student.id, student.role, student.activeRole)}` };

    // Warm, or the race does not happen; see the header.
    const held = await Promise.all(Array.from({ length: TAPS }, () => pool.connect()));
    for (const client of held) client.release();

    const at = (route: string, body?: object) =>
      Promise.all(
        Array.from({ length: TAPS }, () => {
          const call = request(app).post(route).set(auth);
          return body ? call.send(body) : call;
        }),
      );

    const savedUrl = `https://example.test/double-tap-save-${stamp}`;
    const cases: Array<[string, Promise<Array<{ status: number; text: string }>>]> = [
      [`liking a post`, at(`/api/forum/post/${post.id}/like`)],
      [`reposting a post`, at(`/api/forum/posts/${post.id}/repost`)],
      [
        `recommending a resource`,
        at(`/api/classes/${cls.id}/resource-recommendations`, { resourceId: resource.id }),
      ],
      [
        `saving a resource`,
        at(`/api/resources`, {
          title: `Saved once ${stamp}`,
          url: savedUrl,
          format: "article",
          subject: "Physics",
          gradeLevel: "Year 12",
        }),
      ],
      [
        `adding a resource to a list`,
        at(`/api/lists/${list.id}/items`, { resourceId: resource.id }),
      ],
    ];

    for (const [what, pending] of cases) {
      const answers = await pending;
      const failed = answers.filter((answer) => answer.status >= 500);
      expect(
        failed.map((answer) => answer.text.slice(0, 160)),
        `${what}: ${failed.length} of ${TAPS} taps came back a server error`,
      ).toEqual([]);
    }

    // "No 500" is the minimum regression guard. These two actions promise
    // more: the repeated requests must converge on one durable row.
    const savedRows = await db
      .select({ id: resourcesTable.id })
      .from(resourcesTable)
      .where(
        and(
          eq(resourcesTable.submittedById, student.id),
          eq(resourcesTable.url, savedUrl),
        ),
      );
    expect(savedRows).toHaveLength(1);

    const listRows = await db
      .select({ id: listItemsTable.id })
      .from(listItemsTable)
      .where(
        and(
          eq(listItemsTable.listId, list.id),
          eq(listItemsTable.resourceId, resource.id),
        ),
      );
    expect(listRows).toHaveLength(1);
  });
});
