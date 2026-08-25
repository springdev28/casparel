/**
 * @fileOverview Verification role: proves password-gated reset and deletion behavior against real PostgreSQL ownership and cascade rules.
 * System connection: runs with VERIFY_DATABASE_URL in CI, mounts the production auth router, and checks both removed private state and preserved collaborative state.
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

useExclusiveDatabase();

describe.skipIf(!url)("password-gated account lifecycle", () => {
  it("rejects a wrong password, resets only private state, then anonymizes deletion", async () => {
    process.env.DATABASE_URL = url;
    const {
      db,
      usersTable,
      classesTable,
      resourceListsTable,
      resourcesTable,
      learningGoalsTable,
      canvasesTable,
      userPreferencesTable,
    } = await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    const { default: authRouter } = await import("./routes/auth.js");
    const { hashPassword, issueToken, verifyPassword } =
      await import("./lib/auth.js");

    const stamp = Date.now();
    const password = "Current-password-123!";
    const [owner] = await db
      .insert(usersTable)
      .values({
        email: `account-lifecycle-${stamp}@example.test`,
        passwordHash: await hashPassword(password),
        name: "Lifecycle Owner",
        role: "teacher",
        activeRole: "student",
        plan: "teacher-pro",
        bio: "Remove this profile detail",
        subjects: ["Physics"],
        profileVisibility: "everyone",
      })
      .returning();
    const [ownedClass] = await db
      .insert(classesTable)
      .values({
        name: `Preserved class ${stamp}`,
        subject: "Physics",
        gradeLevel: "Year 12",
        teacherId: owner.id,
      })
      .returning();
    await db.insert(userPreferencesTable).values({
      userId: owner.id,
      language: "tr",
      tutorialSeen: true,
    });
    const [goal] = await db
      .insert(learningGoalsTable)
      .values({
        userId: owner.id,
        workspaceRole: "student",
        title: `Private goal ${stamp}`,
        subject: "Physics",
      })
      .returning();
    const [privateList] = await db
      .insert(resourceListsTable)
      .values({ name: `Private list ${stamp}`, ownerId: owner.id })
      .returning();
    const [classList] = await db
      .insert(resourceListsTable)
      .values({
        name: `Class list ${stamp}`,
        ownerId: owner.id,
        classId: ownedClass.id,
      })
      .returning();
    const [privateCanvas] = await db
      .insert(canvasesTable)
      .values({
        title: `Private canvas ${stamp}`,
        ownerId: owner.id,
        visibility: "private",
      })
      .returning();
    const [sharedCanvas] = await db
      .insert(canvasesTable)
      .values({
        title: `Shared canvas ${stamp}`,
        ownerId: owner.id,
        visibility: "link",
      })
      .returning();
    const [unpublishedResource] = await db
      .insert(resourcesTable)
      .values({
        title: `Unpublished resource ${stamp}`,
        url: `https://example.test/unpublished-${stamp}`,
        subject: "Physics",
        gradeLevel: "Year 12",
        submittedById: owner.id,
        verificationStatus: "unverified",
      })
      .returning();
    const [publishedResource] = await db
      .insert(resourcesTable)
      .values({
        title: `Published resource ${stamp}`,
        url: `https://example.test/published-${stamp}`,
        subject: "Physics",
        gradeLevel: "Year 12",
        submittedById: owner.id,
        verificationStatus: "verified",
        verificationSource: "reviewer",
      })
      .returning();

    const app = express();
    app.use(express.json());
    app.use("/api", authRouter);
    const authorization = {
      Authorization: `Bearer ${issueToken(owner.id, owner.role, owner.activeRole)}`,
    };

    const refused = await request(app)
      .post("/api/users/me/reset")
      .set(authorization)
      .send({ password: "wrong-password", confirmation: "RESET" });
    expect(refused.status).toBe(401);
    expect(
      await db
        .select()
        .from(learningGoalsTable)
        .where(eq(learningGoalsTable.id, goal.id)),
      "a wrong password must not remove anything",
    ).toHaveLength(1);

    const reset = await request(app)
      .post("/api/users/me/reset")
      .set(authorization)
      .send({ password, confirmation: "RESET" });
    expect(reset.status, reset.text.slice(0, 300)).toBe(204);

    const [resetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, owner.id));
    expect(resetUser).toMatchObject({
      email: owner.email,
      name: owner.name,
      role: "teacher",
      activeRole: "teacher",
      plan: "teacher-pro",
      bio: null,
      subjects: null,
      profileVisibility: "classmates",
    });
    expect(await verifyPassword(password, resetUser.passwordHash)).toBe(true);
    expect(
      await db
        .select()
        .from(userPreferencesTable)
        .where(eq(userPreferencesTable.userId, owner.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(learningGoalsTable)
        .where(eq(learningGoalsTable.userId, owner.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(resourceListsTable)
        .where(eq(resourceListsTable.id, privateList.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(resourceListsTable)
        .where(eq(resourceListsTable.id, classList.id)),
      "class-linked work belongs to collaborators too",
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(canvasesTable)
        .where(eq(canvasesTable.id, privateCanvas.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(canvasesTable)
        .where(eq(canvasesTable.id, sharedCanvas.id)),
      "a shared canvas must not disappear during reset",
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(resourcesTable)
        .where(eq(resourcesTable.id, unpublishedResource.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(resourcesTable)
        .where(eq(resourcesTable.id, publishedResource.id)),
      "a published contribution must remain",
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(classesTable)
        .where(eq(classesTable.id, ownedClass.id)),
      "reset cannot delete a class other people may use",
    ).toHaveLength(1);

    const deleted = await request(app)
      .delete("/api/users/me")
      .set(authorization)
      .send({ password, confirmation: "DELETE" });
    expect(deleted.status, deleted.text.slice(0, 300)).toBe(204);

    const [deletedUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, owner.id));
    expect(deletedUser.name).toBe("Deleted user");
    expect(deletedUser.email).toMatch(/^deleted-account-.*@invalid\.local$/);
    expect(deletedUser.bannedReason).toBe("Account deleted by user");
    expect(await verifyPassword(password, deletedUser.passwordHash)).toBe(
      false,
    );
    expect(
      await db
        .select()
        .from(resourcesTable)
        .where(
          and(
            eq(resourcesTable.id, publishedResource.id),
            eq(resourcesTable.submittedById, owner.id),
          ),
        ),
      "shared contribution remains attached only to the anonymized account",
    ).toHaveLength(1);
  });
});
