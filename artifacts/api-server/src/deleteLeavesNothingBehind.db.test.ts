/**
 * Deleting a list takes its items, and leaving a class does both halves.
 *
 * Two handlers did their work in more than one statement with nothing holding
 * the statements together.
 *
 * Deleting a list emptied it and then removed it. A failure in between is the
 * worst of both outcomes: somebody's reading list is empty and still there.
 * `list_items.list_id` carries ON DELETE CASCADE, so one statement does it --
 * but that is a claim about the database rather than about the code, and it is
 * the whole reason the first statement could go. So it is checked here against
 * a real one; if a migration ever drops the cascade, this fails rather than
 * quietly leaving orphaned rows behind every delete.
 *
 * A teacher leaving a class handed it to a successor and then removed
 * themselves. Between those two statements the class belonged to a teacher who
 * had not agreed to it while the one leaving was still on the roster -- or, the
 * other way round, a class whose owner had walked out. Neither state is
 * visible or repairable from the app. It is one transaction now, and what is
 * asserted here is the outcome: after the call, the successor owns the class
 * and the leaver is off the roster.
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

describe.skipIf(!url)("deleting a resource list", () => {
  it("takes the items in it, in one statement", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable, resourcesTable, resourceListsTable, listItemsTable } =
      await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { default: listsRouter } = await import("./routes/lists.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [owner] = await db
      .insert(usersTable)
      .values({
        email: `list-cascade-${stamp}@example.test`,
        passwordHash: "x",
        name: "List Owner",
        role: "student",
      })
      .returning();
    const [resource] = await db
      .insert(resourcesTable)
      .values({
        title: `Cascade resource ${stamp}`,
        url: `https://example.test/cascade-${stamp}`,
        format: "article",
        subject: "Physics",
        gradeLevel: "Year 12",
        submittedById: owner.id,
      })
      .returning();
    const [list] = await db
      .insert(resourceListsTable)
      .values({ name: `Cascade list ${stamp}`, ownerId: owner.id })
      .returning();
    await db.insert(listItemsTable).values({ listId: list.id, resourceId: resource.id });

    const app = express();
    app.use(express.json());
    app.use("/api", listsRouter);

    const removed = await request(app)
      .delete(`/api/lists/${list.id}`)
      .set({ Authorization: `Bearer ${issueToken(owner.id, owner.role, owner.activeRole)}` });
    expect(removed.status, removed.text.slice(0, 200)).toBe(204);

    const listsLeft = await db
      .select()
      .from(resourceListsTable)
      .where(eq(resourceListsTable.id, list.id));
    expect(listsLeft, "the list itself").toEqual([]);

    // The point of the test: the cascade, not the handler.
    const itemsLeft = await db
      .select()
      .from(listItemsTable)
      .where(eq(listItemsTable.listId, list.id));
    expect(itemsLeft, "orphaned list items; has the cascade been dropped?").toEqual([]);
  });
});

describe.skipIf(!url)("a teacher leaving their own class", () => {
  it("hands it over and steps off the roster together", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable, classesTable, classMembersTable } = await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    const { default: classesRouter } = await import("./routes/classes.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const makeTeacher = async (label: string) =>
      (
        await db
          .insert(usersTable)
          .values({
            email: `leave-${label}-${stamp}@example.test`,
            passwordHash: "x",
            name: `Leaving ${label}`,
            role: "teacher",
            activeRole: "teacher",
          })
          .returning()
      )[0];

    const leaving = await makeTeacher("owner");
    const successor = await makeTeacher("successor");

    const [cls] = await db
      .insert(classesTable)
      .values({
        name: `Leave ${stamp}`,
        subject: "Physics",
        gradeLevel: "Year 12",
        teacherId: leaving.id,
      })
      .returning();
    // The leaving teacher joined first, so the successor is genuinely the
    // second in line -- which is the branch the handler has to get right.
    await db.insert(classMembersTable).values({ classId: cls.id, userId: leaving.id, role: "teacher" });
    await db.insert(classMembersTable).values({ classId: cls.id, userId: successor.id, role: "teacher" });

    const app = express();
    app.use(express.json());
    app.use("/api", classesRouter);

    const left = await request(app)
      .delete(`/api/classes/${cls.id}/leave`)
      .set({ Authorization: `Bearer ${issueToken(leaving.id, leaving.role, leaving.activeRole)}` });
    expect(left.status, left.text.slice(0, 200)).toBe(204);

    const [after] = await db.select().from(classesTable).where(eq(classesTable.id, cls.id));
    expect(after?.teacherId, "the class should belong to the successor").toBe(successor.id);

    const stillAMember = await db
      .select()
      .from(classMembersTable)
      .where(and(eq(classMembersTable.classId, cls.id), eq(classMembersTable.userId, leaving.id)));
    expect(stillAMember, "the leaver should be off the roster").toEqual([]);
  });

  it("refuses to leave a class with nobody to hand it to", async () => {
    // The other half of the same guard: leaving must not orphan a class.
    process.env.DATABASE_URL = url;
    const { db, usersTable, classesTable, classMembersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { default: classesRouter } = await import("./routes/classes.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const [alone] = await db
      .insert(usersTable)
      .values({
        email: `leave-alone-${stamp}@example.test`,
        passwordHash: "x",
        name: "Only Teacher",
        role: "teacher",
        activeRole: "teacher",
      })
      .returning();
    const [cls] = await db
      .insert(classesTable)
      .values({
        name: `Alone ${stamp}`,
        subject: "Physics",
        gradeLevel: "Year 12",
        teacherId: alone.id,
      })
      .returning();
    await db.insert(classMembersTable).values({ classId: cls.id, userId: alone.id, role: "teacher" });

    const app = express();
    app.use(express.json());
    app.use("/api", classesRouter);

    const left = await request(app)
      .delete(`/api/classes/${cls.id}/leave`)
      .set({ Authorization: `Bearer ${issueToken(alone.id, alone.role, alone.activeRole)}` });
    expect(left.status).toBe(409);

    const [after] = await db.select().from(classesTable).where(eq(classesTable.id, cls.id));
    expect(after?.teacherId, "nothing should have moved").toBe(alone.id);
  });
});
