/**
 * @fileOverview Verification role: exercises Canvas Visibility.Db.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The canvases listing shows a reader their own work, and only what they may see.
 *
 * It used to read the 250 most recently updated canvases in the database and
 * then filter them by access in JavaScript. Two things were wrong with that,
 * and the second is the one that would have been reported as a bug.
 *
 * The cost grew with the whole table: up to six queries per canvas read, on
 * rows that mostly belonged to strangers and were then discarded.
 *
 * And the page was taken before the filter, so it counted other people's work.
 * Once 250 canvases anywhere had been touched more recently than yours, your
 * own canvas was not in the page being filtered and simply stopped appearing.
 * That is the shape of "my work is gone", and no amount of scrolling would
 * have found it.
 *
 * So this checks both halves against a real database: that a reader sees their
 * own canvas with a crowd of newer ones from strangers in front of it, that
 * they see what is shared with them and nothing else, and that the answer
 * costs a fixed handful of queries.
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

describe.skipIf(!url)("the canvases listing", () => {
  it("shows what the reader may see, however much newer work exists", async () => {
    process.env.DATABASE_URL = url;
    const {
      db,
      pool,
      usersTable,
      classesTable,
      classMembersTable,
      canvasesTable,
      canvasCollaboratorsTable,
    } = await import("@workspace/db");
    const { default: canvasesRouter } = await import("./routes/canvases.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = Date.now();
    const person = async (name: string, role: "student" | "teacher") => {
      const [row] = await db
        .insert(usersTable)
        .values({
          email: `canvas-${name}-${stamp}@example.test`,
          passwordHash: "x",
          name,
          role,
          activeRole: role,
        })
        .returning();
      return row;
    };

    const reader = await person("Reader", "student");
    const teacher = await person("Teacher", "teacher");
    const stranger = await person("Stranger", "student");

    const [cls] = await db
      .insert(classesTable)
      .values({
        name: `Canvas class ${stamp}`,
        subject: "Physics",
        gradeLevel: "Year 12",
        teacherId: teacher.id,
      })
      .returning();
    await db
      .insert(classMembersTable)
      .values({ classId: cls.id, userId: reader.id, role: "student" });

    const canvas = async (
      title: string,
      values: Partial<typeof canvasesTable.$inferInsert> = {},
    ) => {
      const [row] = await db
        .insert(canvasesTable)
        .values({
          title: `${title} ${stamp}`,
          ownerId: stranger.id,
          document: { nodes: [], edges: [] },
          ...values,
        })
        .returning();
      return row;
    };

    const own = await canvas("Mine", { ownerId: reader.id });
    const sharedWithMe = await canvas("Shared with me");
    await db.insert(canvasCollaboratorsTable).values({
      canvasId: sharedWithMe.id,
      userId: reader.id,
      role: "viewer",
      addedById: stranger.id,
    });
    const classCanvas = await canvas("Class canvas", {
      ownerId: teacher.id,
      classId: cls.id,
      visibility: "class",
    });
    const classPrivate = await canvas("Class private", {
      ownerId: teacher.id,
      classId: cls.id,
      visibility: "private",
    });
    const strangers = await canvas("Somebody else's");

    /*
     * The crowd, and it has to be this big to prove anything: the route reads
     * a page of 250, and the defect was that the page was taken before the
     * filter. Fewer than 250 newer canvases and the reader's own is still in
     * the window, so the old code would have passed everything below.
     */
    await db.insert(canvasesTable).values(
      Array.from({ length: 260 }, (_unused, index) => ({
        title: `Crowd ${index} ${stamp}`,
        ownerId: stranger.id,
        document: { nodes: [], edges: [] },
      })),
    );

    const app = express();
    app.use(express.json());
    app.use("/api", canvasesRouter);
    const auth = {
      Authorization: `Bearer ${issueToken(reader.id, reader.role, reader.activeRole)}`,
    };

    const original = pool.query.bind(pool);
    let count = 0;
    (pool as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;
      return (original as (...a: unknown[]) => unknown)(...args);
    };
    let body: Array<{ id: number; permissions: { role: string }; owner: { name: string } | null; collaboratorCount: number }>;
    try {
      const response = await request(app).get("/api/canvases").set(auth);
      expect(response.status, response.text.slice(0, 200)).toBe(200);
      body = response.body;
    } finally {
      (pool as { query: unknown }).query = original;
    }

    const ids = body.map((row) => row.id).sort((a, b) => a - b);
    expect(ids).toEqual([own.id, sharedWithMe.id, classCanvas.id].sort((a, b) => a - b));
    expect(ids).not.toContain(strangers.id);
    // Private is private even inside a class the reader belongs to.
    expect(ids).not.toContain(classPrivate.id);

    const byId = new Map(body.map((row) => [row.id, row]));
    expect(byId.get(own.id)?.permissions.role).toBe("owner");
    expect(byId.get(sharedWithMe.id)?.permissions.role).toBe("viewer");
    expect(byId.get(classCanvas.id)?.permissions.role).toBe("class-viewer");
    // The decoration is still there, and still per canvas.
    expect(byId.get(sharedWithMe.id)?.owner?.name).toBe("Stranger");
    expect(byId.get(sharedWithMe.id)?.collaboratorCount).toBe(1);
    expect(byId.get(own.id)?.collaboratorCount).toBe(0);

    expect(
      count,
      `the listing took ${count} queries against a table of 265 canvases; it ` +
        `should be a fixed handful whatever the table holds`,
    ).toBeLessThanOrEqual(10);
  });

  it("still lets the teacher of a class see its canvases", async () => {
    process.env.DATABASE_URL = url;
    const { db, usersTable, classesTable, canvasesTable } = await import("@workspace/db");
    const { default: canvasesRouter } = await import("./routes/canvases.js");
    const { issueToken } = await import("./lib/auth.js");

    const stamp = `${Date.now()}b`;
    const [teacher] = await db
      .insert(usersTable)
      .values({
        email: `canvas-teacher-${stamp}@example.test`,
        passwordHash: "x",
        name: "Class Teacher",
        role: "teacher",
        activeRole: "teacher",
      })
      .returning();
    const [student] = await db
      .insert(usersTable)
      .values({
        email: `canvas-student-${stamp}@example.test`,
        passwordHash: "x",
        name: "Class Student",
        role: "student",
      })
      .returning();
    const [cls] = await db
      .insert(classesTable)
      .values({
        name: `Taught ${stamp}`,
        subject: "Physics",
        gradeLevel: "Year 12",
        teacherId: teacher.id,
      })
      .returning();
    // A pupil's private canvas, made inside the teacher's class.
    const [pupils] = await db
      .insert(canvasesTable)
      .values({
        title: `Pupil's ${stamp}`,
        ownerId: student.id,
        classId: cls.id,
        visibility: "private",
        document: { nodes: [], edges: [] },
      })
      .returning();

    const app = express();
    app.use(express.json());
    app.use("/api", canvasesRouter);
    const response = await request(app)
      .get("/api/canvases")
      .set({
        Authorization: `Bearer ${issueToken(teacher.id, teacher.role, teacher.activeRole)}`,
      });
    expect(response.status).toBe(200);
    const found = response.body.find((row: { id: number }) => row.id === pupils.id);
    // Unchanged behaviour, stated so a future filter cannot quietly drop it:
    // the teacher of the class this canvas belongs to manages it.
    expect(found?.permissions?.role).toBe("owner");
  });
});
