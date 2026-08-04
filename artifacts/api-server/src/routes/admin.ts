import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  learningGoalsTable,
  resourcesTable,
  sourceReviewCacheTable,
} from "@workspace/db";
import { GetAdminOverviewResponse } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

async function count(table: Parameters<typeof db.select>[0] extends never ? never : any) {
  const [row] = await db.select({ value: sql<number>`cast(count(*) as int)` }).from(table);
  return row?.value ?? 0;
}

router.get("/admin/overview", requireAdmin, async (_req, res): Promise<void> => {
  const [users, students, teachers, admins, goals, resources, cachedResearchReports, usageResult] =
    await Promise.all([
      count(usersTable),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(usersTable).where(eq(usersTable.role, "student")).then(([row]) => row?.value ?? 0),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(usersTable).where(eq(usersTable.role, "teacher")).then(([row]) => row?.value ?? 0),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(usersTable).where(eq(usersTable.role, "admin")).then(([row]) => row?.value ?? 0),
      count(learningGoalsTable),
      count(resourcesTable),
      count(sourceReviewCacheTable),
      pool.query<{ key: string; hits: number }>(
        `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
         FROM rate_limit_hits WHERE key = ANY($1::text[])`,
        [["ai-search-daily:all-ai-searches", "deep-global-day:all"]],
      ),
    ]);
  const usageByKey = new Map(usageResult.rows.map((row) => [row.key, Number(row.hits)]));
  res.json(GetAdminOverviewResponse.parse({
    users, students, teachers, admins, goals, resources, cachedResearchReports,
    plan: { name: "Administrator", status: "active", aiSearchLimit: null, deepResearchDailyLimit: null },
    usage: {
      aiSearchesToday: usageByKey.get("ai-search-daily:all-ai-searches") ?? 0,
      deepResearchToday: usageByKey.get("deep-global-day:all") ?? 0,
    },
  }));
});

export default router;
