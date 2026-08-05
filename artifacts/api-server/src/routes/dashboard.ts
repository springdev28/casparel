import { Router, type IRouter } from "express";
import { eq, sql, and, or } from "drizzle-orm"; // `or` used in listCount query
import {
  db,
  classesTable,
  classMembersTable,
  resourcesTable,
  reviewsTable,
  resourceListsTable,
  scheduleBlocksTable,
  activityLogTable,
} from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// GET /dashboard/summary
router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;

  const [{ classCount }] = await db
    .select({ classCount: sql<number>`cast(count(*) as int)` })
    .from(classMembersTable)
    .where(eq(classMembersTable.userId, userId));

  const [{ resourceCount }] = await db
    .select({ resourceCount: sql<number>`cast(count(*) as int)` })
    .from(resourcesTable);

  const [{ listCount }] = await db
    .select({ listCount: sql<number>`cast(count(*) as int)` })
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.ownerId, userId), or(eq(resourceListsTable.workspaceRole, userRole as "student" | "teacher"), eq(resourceListsTable.workspaceRole, "shared"))!));

  const [{ reviewCount }] = await db
    .select({ reviewCount: sql<number>`cast(count(*) as int)` })
    .from(reviewsTable)
    .where(eq(reviewsTable.userId, userId));

  const [{ scheduleBlockCount }] = await db
    .select({ scheduleBlockCount: sql<number>`cast(count(*) as int)` })
    .from(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.userId, userId));

  // Student count: members in classes the user teaches
  let studentCount = 0;
  if (userRole === "teacher") {
    const ownedClasses = await db
      .select({ id: classesTable.id })
      .from(classesTable)
      .where(eq(classesTable.teacherId, userId));
    const classIds = ownedClasses.map((c) => c.id);
    if (classIds.length > 0) {
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(classMembersTable)
        .where(eq(classMembersTable.role, "student"));
      studentCount = count;
    }
  }

  res.json(
    GetDashboardSummaryResponse.parse({
      classCount,
      resourceCount,
      listCount,
      reviewCount,
      scheduleBlockCount,
      studentCount,
    }),
  );
});

// GET /activity/recent
router.get("/activity/recent", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const rows = await db
    .select()
    .from(activityLogTable)
    .where(and(
      eq(activityLogTable.userId, userId),
      eq(activityLogTable.workspaceRole, userRole as "student" | "teacher"),
    ))
    .orderBy(sql`created_at desc`)
    .limit(20);
  res.json(GetRecentActivityResponse.parse(rows.map((r) => ({ ...r, userName: null }))));
});

export default router;
