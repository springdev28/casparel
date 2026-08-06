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

async function count(
  table: Parameters<typeof db.select>[0] extends never ? never : any,
) {
  const [row] = await db
    .select({ value: sql<number>`cast(count(*) as int)` })
    .from(table);
  return row?.value ?? 0;
}

router.get(
  "/admin/overview",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const [
      users,
      students,
      teachers,
      admins,
      goals,
      resources,
      cachedResearchReports,
      usageResult,
      allUsageResult,
      userRows,
    ] = await Promise.all([
      count(usersTable),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(usersTable)
        .where(eq(usersTable.role, "student"))
        .then(([row]) => row?.value ?? 0),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(usersTable)
        .where(eq(usersTable.role, "teacher"))
        .then(([row]) => row?.value ?? 0),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(usersTable)
        .where(eq(usersTable.role, "admin"))
        .then(([row]) => row?.value ?? 0),
      count(learningGoalsTable),
      count(resourcesTable),
      count(sourceReviewCacheTable),
      pool.query<{ key: string; hits: number }>(
        `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
         FROM rate_limit_hits WHERE key = ANY($1::text[])`,
        [["ai-search-daily:all-ai-searches", "deep-global-day:all"]],
      ),
      pool.query<{ key: string; hits: number }>(
        `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
         FROM rate_limit_hits
         WHERE key LIKE 'usage-total:%' OR key LIKE 'usage-month:%' OR key LIKE 'usage-user-total:%'`,
      ),
      db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
        })
        .from(usersTable),
    ]);
    const usageByKey = new Map(
      usageResult.rows.map((row) => [row.key, Number(row.hits)]),
    );
    const counters = new Map(
      allUsageResult.rows.map((row) => [row.key, Number(row.hits)]),
    );
    const featureCosts = {
      search: 0.012,
      "quick-review": 0.001,
      "deep-research": 0.05,
      metadata: 0.0005,
    } as const;
    const features = Object.keys(featureCosts) as Array<
      keyof typeof featureCosts
    >;
    const featureUsage = Object.fromEntries(
      features.map((feature) => {
        const total = counters.get(`usage-total:${feature}`) ?? 0;
        const month = counters.get(`usage-month:${feature}`) ?? 0;
        return [
          feature,
          {
            total,
            month,
            estimatedCostUsd: Number(
              (total * featureCosts[feature]).toFixed(2),
            ),
          },
        ];
      }),
    ) as Record<
      keyof typeof featureCosts,
      { total: number; month: number; estimatedCostUsd: number }
    >;
    const userUsage = userRows
      .map((user) => {
        const values = Object.fromEntries(
          features.map((feature) => [
            feature,
            counters.get(`usage-user-total:${user.id}:${feature}`) ?? 0,
          ]),
        ) as Record<keyof typeof featureCosts, number>;
        const total = features.reduce(
          (sum, feature) => sum + values[feature],
          0,
        );
        const estimatedCostUsd = features.reduce(
          (sum, feature) => sum + values[feature] * featureCosts[feature],
          0,
        );
        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          searches: values.search,
          quickReviews: values["quick-review"],
          deepResearch: values["deep-research"],
          metadata: values.metadata,
          total,
          estimatedCostUsd: Number(estimatedCostUsd.toFixed(2)),
        };
      })
      .filter((user) => user.total > 0)
      .sort((a, b) => b.total - a.total);
    const totalAiRequests = features.reduce(
      (sum, feature) => sum + featureUsage[feature].total,
      0,
    );
    const estimatedCostUsd = features.reduce(
      (sum, feature) => sum + featureUsage[feature].estimatedCostUsd,
      0,
    );
    res.json(
      GetAdminOverviewResponse.parse({
        users,
        students,
        teachers,
        admins,
        goals,
        resources,
        cachedResearchReports,
        plan: {
          name: "Administrator",
          status: "active",
          aiSearchLimit: null,
          deepResearchDailyLimit: null,
        },
        usage: {
          aiSearchesToday:
            usageByKey.get("ai-search-daily:all-ai-searches") ?? 0,
          deepResearchToday: usageByKey.get("deep-global-day:all") ?? 0,
          totalAiRequests,
          estimatedCostUsd: Number(estimatedCostUsd.toFixed(2)),
          byFeature: featureUsage,
          byUser: userUsage,
        },
      }),
    );
  },
);

const adminUserSelection = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  role: usersTable.role,
  activeRole: usersTable.activeRole,
  teacherVerified: usersTable.teacherVerified,
  avatarUrl: usersTable.avatarUrl,
  bio: usersTable.bio,
  subjects: usersTable.subjects,
  gradeOrDept: usersTable.gradeOrDept,
  timezone: usersTable.timezone,
  profileVisibility: usersTable.profileVisibility,
  libraryVisibility: usersTable.libraryVisibility,
  showBio: usersTable.showBio,
  showSubjects: usersTable.showSubjects,
  showGradeOrDept: usersTable.showGradeOrDept,
  showWebsite: usersTable.showWebsite,
  websiteUrl: usersTable.websiteUrl,
  bannedAt: usersTable.bannedAt,
  bannedReason: usersTable.bannedReason,
  createdAt: usersTable.createdAt,
};

router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select(adminUserSelection)
    .from(usersTable)
    .orderBy(sql`${usersTable.createdAt} desc`);
  res.json(users);
});

router.patch("/admin/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const adminId = (req as import("../middlewares/requireAuth").AuthenticatedRequest).userId;
  const targetId = Number(req.params.id);
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
  if (!targetId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  if (targetId === adminId) {
    res.status(400).json({ error: "Administrators cannot ban their own account" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({
      bannedAt: new Date().toISOString(),
      bannedReason: reason || "Banned by an administrator",
    })
    .where(eq(usersTable.id, targetId))
    .returning(adminUserSelection);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

router.patch("/admin/users/:id/teacher-verification", requireAdmin, async (req, res): Promise<void> => {
  const targetId = Number(req.params.id);
  const verified = req.body?.verified === true;
  if (!targetId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const [target] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, targetId));
  if (!target || target.role !== "teacher") {
    res.status(400).json({ error: "Only teacher accounts can be verified" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ teacherVerified: verified })
    .where(eq(usersTable.id, targetId))
    .returning(adminUserSelection);
  res.json(user);
});

router.delete("/admin/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const targetId = Number(req.params.id);
  if (!targetId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ bannedAt: null, bannedReason: null })
    .where(eq(usersTable.id, targetId))
    .returning(adminUserSelection);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

export default router;
