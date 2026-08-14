/**
 * Seed script, run once to populate dev data.
 * Usage: pnpm --filter @workspace/api-server tsx src/lib/seed.ts
 */
import "dotenv/config";
import { db, usersTable, classesTable, classMembersTable, resourcesTable, reviewsTable, resourceListsTable, listItemsTable, scheduleBlocksTable, activityLogTable } from "@workspace/db";
import { hashPassword } from "./auth";

async function seed() {
  console.log("Seeding...");

  // Users
  const [teacher] = await db
    .insert(usersTable)
    .values({
      email: "teacher@schooler.dev",
      passwordHash: await hashPassword("password123"),
      name: "Alex Johnson",
      role: "teacher",
    })
    .onConflictDoNothing()
    .returning();

  const [student] = await db
    .insert(usersTable)
    .values({
      email: "student@schooler.dev",
      passwordHash: await hashPassword("password123"),
      name: "Sam Rivera",
      role: "student",
    })
    .onConflictDoNothing()
    .returning();

  if (!teacher || !student) {
    console.log("Users already exist, skipping seed.");
    return;
  }

  // Class
  const [mathClass] = await db
    .insert(classesTable)
    .values({ name: "Algebra II", subject: "Mathematics", gradeLevel: "10th Grade", teacherId: teacher.id })
    .returning();

  await db
    .insert(classMembersTable)
    .values([
      { userId: teacher.id, classId: mathClass.id, role: "teacher" },
      { userId: student.id, classId: mathClass.id, role: "student" },
    ])
    .onConflictDoNothing();

  // Resources
  const [res1] = await db
    .insert(resourcesTable)
    .values({
      title: "Khan Academy, Quadratic Equations",
      url: "https://www.khanacademy.org/math/algebra-home/alg-quadratics",
      description: "Interactive lessons on quadratic equations with practice problems.",
      format: "interactive",
      subject: "Mathematics",
      gradeLevel: "10th Grade",
      submittedById: teacher.id,
      verificationStatus: "verified",
      verificationSource: "reviewer",
    })
    .returning();

  const [res2] = await db
    .insert(resourcesTable)
    .values({
      title: "MIT OpenCourseWare, Linear Algebra",
      url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
      description: "Full course materials from MIT's Linear Algebra course.",
      format: "video",
      subject: "Mathematics",
      gradeLevel: "12th Grade",
      submittedById: teacher.id,
      verificationStatus: "verified",
      verificationSource: "reviewer",
    })
    .returning();

  // Reviews
  await db.insert(reviewsTable).values([
    { resourceId: res1.id, userId: student.id, rating: 5, comment: "Fantastic resource, very clear explanations!" },
    { resourceId: res2.id, userId: student.id, rating: 4, comment: "Great lectures, challenging but rewarding." },
  ]);

  // Resource list
  const [list1] = await db
    .insert(resourceListsTable)
    .values({ name: "Algebra Study Pack", description: "Key resources for Algebra II", ownerId: teacher.id, classId: mathClass.id })
    .returning();

  await db.insert(listItemsTable).values([
    { listId: list1.id, resourceId: res1.id, note: "Start here" },
    { listId: list1.id, resourceId: res2.id, note: "Advanced supplement" },
  ]);

  // Schedule block
  await db.insert(scheduleBlocksTable).values({
    userId: student.id,
    title: "Algebra Study Session",
    date: "2026-08-05",
    startTime: "14:00",
    endTime: "15:30",
    classId: mathClass.id,
    notes: "Focus on quadratic formula",
  });

  // Activity log
  await db.insert(activityLogTable).values([
    { userId: student.id, type: "resource", message: "Sam Rivera explored Khan Academy, Quadratic Equations" },
    { userId: student.id, type: "review", message: "Sam Rivera reviewed Khan Academy, Quadratic Equations (5★)" },
    { userId: teacher.id, type: "class", message: "Alex Johnson created Algebra II" },
  ]);

  console.log("✓ Seed complete!");
}

seed().catch(console.error).finally(() => process.exit(0));
