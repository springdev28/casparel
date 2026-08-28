/**
 * @fileOverview API role: implements the Admin HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  pool,
  usersTable,
  classesTable,
  classMembersTable,
  learningGoalsTable,
  resourcesTable,
  forumMaterialsTable,
  forumPostsTable,
  forumCommentsTable,
  studyActivitiesTable,
  canvasesTable,
  canvasCollaboratorsTable,
  resourceListsTable,
  classAssignmentsTable,
  scheduleBlocksTable,
  studySessionsTable,
  learningEvidenceTable,
  sourceReviewCacheTable,
} from "@workspace/db";
import { GetAdminOverviewResponse } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { validationMessage } from "../lib/validationMessage";
import { normalizePlan } from "../lib/entitlements";
import {
  ECONOMIC_ASSUMPTIONS,
  PLAN_CATALOG,
  SERVICE_AI_BUDGETS,
  deepResearchRawCostUsd,
  discoveryRawCostUsd,
  type SubscriptionTier,
} from "@workspace/plan-economics";

const router: IRouter = Router();

async function count(
  table: Parameters<typeof db.select>[0] extends never ? never : any,
) {
  const [row] = await db
    .select({ value: sql<number>`cast(count(*) as int)` })
    .from(table);
  return row?.value ?? 0;
}

async function readUsageRows(statement: string, values?: unknown[]) {
  try {
    const result = await pool.query<{ key: string; hits: number }>(statement, values);
    return result.rows;
  } catch {
    // The app starts listening before asynchronous database preparation finishes.
    // Admin account data should remain available while the usage store initializes.
    return [];
  }
}

const emptyWorkflowAnalytics = {
  funnel: {
    viewed: 0,
    reviewed: 0,
    saved: 0,
    activityCreated: 0,
    classShared: 0,
    assignmentCreated: 0,
    completedJourneys: 0,
    viewToReviewRate: 0,
    reviewToSaveRate: 0,
    saveToActivityRate: 0,
    activityToClassRate: 0,
    classToAssignmentRate: 0,
  },
  engagement: {
    activeUsers7d: 0,
    activeUsers30d: 0,
    weeklyActiveClasses: 0,
    avgMinutesToFirstActivity: 0,
    inviteAcceptanceRate: 0,
    assignmentCompletionRate: 0,
    remixRate: 0,
    teacherApprovalRate: 0,
    reportsPerThousand: 0,
    estimatedStoredMb: 0,
  },
};

function percentage(numerator: number, denominator: number) {
  return denominator
    ? Number(((numerator / denominator) * 100).toFixed(1))
    : 0;
}

async function readWorkflowAnalytics() {
  try {
    const [workflowResult, inviteResult, assignmentResult, communityResult, storageResult] =
      await Promise.all([
        pool.query<{
          viewed: number;
          reviewed: number;
          saved: number;
          activity_created: number;
          class_shared: number;
          assignment_created: number;
          completed_journeys: number;
          active_users_7d: number;
          active_users_30d: number;
          weekly_active_classes: number;
          remix_events: number;
          average_minutes: number;
        }>(`
          WITH journeys AS (
            SELECT user_id, resource_id,
              MIN(created_at) FILTER (WHERE event = 'resource_viewed') AS viewed_at,
              MIN(created_at) FILTER (WHERE event = 'activity_created' OR event = 'activity_remixed') AS activity_at,
              BOOL_OR(event = 'resource_reviewed') AS reviewed,
              BOOL_OR(event = 'resource_saved') AS saved,
              BOOL_OR(event = 'activity_created' OR event = 'activity_remixed') AS activity_created,
              BOOL_OR(event = 'class_shared') AS class_shared,
              BOOL_OR(event = 'assignment_created') AS assignment_created
            FROM workflow_events
            WHERE resource_id IS NOT NULL
            GROUP BY user_id, resource_id
          )
          SELECT
            COUNT(*) FILTER (WHERE viewed_at IS NOT NULL)::int AS viewed,
            COUNT(*) FILTER (WHERE reviewed)::int AS reviewed,
            COUNT(*) FILTER (WHERE saved)::int AS saved,
            COUNT(*) FILTER (WHERE activity_created)::int AS activity_created,
            COUNT(*) FILTER (WHERE class_shared)::int AS class_shared,
            COUNT(*) FILTER (WHERE assignment_created)::int AS assignment_created,
            COUNT(*) FILTER (WHERE reviewed AND saved AND activity_created AND class_shared AND assignment_created)::int AS completed_journeys,
            (SELECT COUNT(DISTINCT user_id)::int FROM workflow_events WHERE created_at >= NOW() - INTERVAL '7 days') AS active_users_7d,
            (SELECT COUNT(DISTINCT user_id)::int FROM workflow_events WHERE created_at >= NOW() - INTERVAL '30 days') AS active_users_30d,
            (SELECT COUNT(DISTINCT class_id)::int FROM workflow_events WHERE class_id IS NOT NULL AND created_at >= NOW() - INTERVAL '7 days') AS weekly_active_classes,
            (SELECT COUNT(*)::int FROM workflow_events WHERE event = 'activity_remixed') AS remix_events,
            COALESCE(AVG(EXTRACT(EPOCH FROM (activity_at - viewed_at)) / 60) FILTER (WHERE activity_at >= viewed_at), 0)::float AS average_minutes
          FROM journeys
        `),
        pool.query<{ total: number; accepted: number }>(`
          SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted
          FROM class_invitations
        `),
        pool.query<{ expected: number; completed: number }>(`
          SELECT
            COUNT(*)::int AS expected,
            COUNT(ac.assignment_id)::int AS completed
          FROM class_assignments ca
          JOIN class_members cm ON cm.class_id = ca.class_id AND cm.role = 'student'
          LEFT JOIN assignment_completions ac
            ON ac.assignment_id = ca.id AND ac.user_id = cm.user_id
        `),
        pool.query<{
          activities: number;
          student_materials: number;
          approved_student_materials: number;
          reports: number;
          content_items: number;
        }>(`
          SELECT
            (SELECT COUNT(*)::int FROM study_activities) AS activities,
            (SELECT COUNT(*)::int FROM forum_materials WHERE uploader_role = 'student') AS student_materials,
            (SELECT COUNT(DISTINCT fm.id)::int FROM forum_materials fm JOIN forum_material_approvals fa ON fa.material_id = fm.id WHERE fm.uploader_role = 'student') AS approved_student_materials,
            (SELECT COUNT(*)::int FROM forum_reports) AS reports,
            ((SELECT COUNT(*) FROM forum_materials) + (SELECT COUNT(*) FROM forum_posts) + (SELECT COUNT(*) FROM forum_comments))::int AS content_items
        `),
        pool.query<{ bytes: number }>(`
          SELECT COALESCE(SUM(bytes), 0)::bigint AS bytes FROM (
            SELECT COALESCE(SUM(pg_column_size(cards)), 0) AS bytes FROM study_activities
            UNION ALL SELECT COALESCE(SUM(pg_column_size(document)), 0) FROM canvases
            UNION ALL SELECT COALESCE(SUM(octet_length(COALESCE(file_base64, ''))), 0) FROM forum_materials
            UNION ALL SELECT COALESCE(SUM(octet_length(COALESCE(attachment_file_base64, ''))), 0) FROM forum_posts
          ) stored
        `),
      ]);

    const workflow = workflowResult.rows[0];
    const invitations = inviteResult.rows[0];
    const assignments = assignmentResult.rows[0];
    const community = communityResult.rows[0];
    const storage = storageResult.rows[0];
    if (!workflow || !invitations || !assignments || !community || !storage) {
      return emptyWorkflowAnalytics;
    }

    return {
      funnel: {
        viewed: Number(workflow.viewed),
        reviewed: Number(workflow.reviewed),
        saved: Number(workflow.saved),
        activityCreated: Number(workflow.activity_created),
        classShared: Number(workflow.class_shared),
        assignmentCreated: Number(workflow.assignment_created),
        completedJourneys: Number(workflow.completed_journeys),
        viewToReviewRate: percentage(workflow.reviewed, workflow.viewed),
        reviewToSaveRate: percentage(workflow.saved, workflow.reviewed),
        saveToActivityRate: percentage(workflow.activity_created, workflow.saved),
        activityToClassRate: percentage(workflow.class_shared, workflow.activity_created),
        classToAssignmentRate: percentage(workflow.assignment_created, workflow.class_shared),
      },
      engagement: {
        activeUsers7d: Number(workflow.active_users_7d),
        activeUsers30d: Number(workflow.active_users_30d),
        weeklyActiveClasses: Number(workflow.weekly_active_classes),
        avgMinutesToFirstActivity: Number(Number(workflow.average_minutes).toFixed(1)),
        inviteAcceptanceRate: percentage(invitations.accepted, invitations.total),
        assignmentCompletionRate: percentage(assignments.completed, assignments.expected),
        remixRate: percentage(workflow.remix_events, community.activities),
        teacherApprovalRate: percentage(
          community.approved_student_materials,
          community.student_materials,
        ),
        reportsPerThousand: community.content_items
          ? Number(((community.reports / community.content_items) * 1000).toFixed(1))
          : 0,
        estimatedStoredMb: Number((Number(storage.bytes) / 1024 / 1024).toFixed(2)),
      },
    };
  } catch {
    return emptyWorkflowAnalytics;
  }
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
      workflow,
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
      readUsageRows(
        `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
         FROM rate_limit_hits WHERE key = ANY($1::text[])`,
        [["ai-search-daily:all-ai-searches", "deep-global-day:all"]],
      ),
      readUsageRows(
        `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
         FROM rate_limit_hits
         WHERE key LIKE 'usage-total:%'
            OR key LIKE 'usage-month:%'
            OR key LIKE 'usage-user-month:%'
            OR key LIKE 'usage-plan-month:%'
            OR key LIKE 'cache-month:%'`,
      ),
      db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          plan: usersTable.plan,
          planExpiresAt: usersTable.planExpiresAt,
          role: usersTable.role,
        })
        .from(usersTable),
      readWorkflowAnalytics(),
    ]);
    const usageByKey = new Map(
      usageResult.map((row) => [row.key, Number(row.hits)]),
    );
    const counters = new Map(
      allUsageResult.map((row) => [row.key, Number(row.hits)]),
    );
    const featureCosts = {
      search: discoveryRawCostUsd(),
      "quick-review": 0,
      "deep-research": deepResearchRawCostUsd(),
      metadata: 0,
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
              (month * featureCosts[feature]).toFixed(2),
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
            counters.get(`usage-user-month:${user.id}:${feature}`) ?? 0,
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
          plan: normalizePlan(user.plan, user.planExpiresAt, user.role),
          searches: values.search,
          quickReviews: values["quick-review"],
          deepResearch: values["deep-research"],
          metadata: values.metadata,
          total,
          estimatedCostUsd: Number(estimatedCostUsd.toFixed(2)),
        };
      })
      .filter((user) => user.total > 0)
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
    const totalAiRequests = features.reduce(
      (sum, feature) => sum + featureUsage[feature].total,
      0,
    );
    const estimatedCostUsd = features.reduce(
      (sum, feature) => sum + featureUsage[feature].estimatedCostUsd,
      0,
    );
    const commercialUsers = userRows
      .map((user) => normalizePlan(user.plan, user.planExpiresAt, user.role))
      .filter((tier): tier is Exclude<SubscriptionTier, "free"> => tier !== "free");
    let institutionalContractCounted = false;
    const monthlyRevenueUsd = commercialUsers.reduce((sum, tier) => {
      if (tier === "institutional") {
        if (institutionalContractCounted) return sum;
        institutionalContractCounted = true;
      }
      const price = PLAN_CATALOG[tier].price;
      if (!price) return sum;
      const fee = tier === "institutional"
        ? ECONOMIC_ASSUMPTIONS.invoicePaymentShare
        : ECONOMIC_ASSUMPTIONS.playStoreRevenueShare +
          ECONOMIC_ASSUMPTIONS.revenueCatRevenueShare;
      return sum + price.monthlyUsd * (1 - fee);
    }, 0);
    const byPlan = Object.fromEntries(
      (Object.keys(PLAN_CATALOG) as SubscriptionTier[]).map((tier) => {
        const requests = features.reduce(
          (sum, feature) =>
            sum + (counters.get(`usage-plan-month:${tier}:${feature}`) ?? 0),
          0,
        );
        const costUsd = features.reduce(
          (sum, feature) =>
            sum +
            (counters.get(`usage-plan-month:${tier}:${feature}`) ?? 0) *
              featureCosts[feature],
          0,
        );
        return [tier, { requests, costUsd: Number(costUsd.toFixed(2)) }];
      }),
    );
    const searchCacheHits = counters.get("cache-month:search") ?? 0;
    const deepCacheHits = counters.get("cache-month:deep-research") ?? 0;
    const cacheHits = searchCacheHits + deepCacheHits;
    const monthlyAiCalls = features.reduce(
      (sum, feature) => sum + featureUsage[feature].month,
      0,
    );
    const avoidedCostUsd =
      searchCacheHits * featureCosts.search +
      deepCacheHits * featureCosts["deep-research"];
    const storedBytes = Math.round(
      (workflow.engagement.estimatedStoredMb ?? 0) * 1024 * 1024,
    );
    const storageCostUsd =
      (storedBytes / (1024 * 1024 * 1024)) *
      ECONOMIC_ASSUMPTIONS.storageUsdPerGibMonth;
    let countedInstitutionalOverhead = false;
    const otherVariableCostUsd = userRows.reduce((sum, user) => {
      const tier = normalizePlan(user.plan, user.planExpiresAt, user.role);
      if (tier !== "institutional") {
        return sum + ECONOMIC_ASSUMPTIONS.otherVariableUsdPerAccountMonth;
      }
      if (countedInstitutionalOverhead) return sum;
      countedInstitutionalOverhead = true;
      return sum + ECONOMIC_ASSUMPTIONS.institutionalOtherVariableUsdPerMonth;
    }, 0);
    const variableCostUsd =
      estimatedCostUsd + storageCostUsd + otherVariableCostUsd;
    const grossMargin = monthlyRevenueUsd > 0
      ? (monthlyRevenueUsd - variableCostUsd) / monthlyRevenueUsd
      : null;
    const globalMonthlyBudgetUsd =
      SERVICE_AI_BUDGETS.discoveryPerMonth * featureCosts.search +
      SERVICE_AI_BUDGETS.deepPerMonth * featureCosts["deep-research"];
    const budgetRatio = globalMonthlyBudgetUsd > 0
      ? estimatedCostUsd / globalMonthlyBudgetUsd
      : 0;
    const budgetStatus = budgetRatio >= 0.95
      ? "emergency"
      : budgetRatio >= 0.8
        ? "red"
      : budgetRatio >= 0.5
        ? "yellow"
        : "green";
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
          economics: {
            monthlyRevenueUsd: Number(monthlyRevenueUsd.toFixed(2)),
            variableCostUsd: Number(variableCostUsd.toFixed(2)),
            storageCostUsd: Number(storageCostUsd.toFixed(2)),
            grossMargin: grossMargin === null ? null : Number(grossMargin.toFixed(4)),
            byPlan,
            cacheHits,
            cacheHitRate: monthlyAiCalls + cacheHits > 0
              ? Number((cacheHits / (monthlyAiCalls + cacheHits)).toFixed(4))
              : 0,
            avoidedCostUsd: Number(avoidedCostUsd.toFixed(2)),
            storedBytes,
            budgetStatus,
            budgetRatio: Number(budgetRatio.toFixed(4)),
          },
        },
        workflow,
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

const adminUserUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().max(320).transform((value) => value.toLowerCase()).optional(),
  role: z.enum(["student", "teacher", "admin"]).optional(),
  activeRole: z.enum(["student", "teacher", "admin"]).optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(30).nullable().optional(),
  gradeOrDept: z.string().trim().max(160).nullable().optional(),
  timezone: z.string().trim().max(100).nullable().optional(),
  websiteUrl: z.union([z.string().url().max(1000), z.literal(""), z.null()]).optional(),
  profileVisibility: z.enum(["everyone", "classmates", "private"]).optional(),
  libraryVisibility: z.enum(["everyone", "classmates", "private"]).optional(),
  showBio: z.boolean().optional(),
  showSubjects: z.boolean().optional(),
  showGradeOrDept: z.boolean().optional(),
  showWebsite: z.boolean().optional(),
}).strict();

router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const adminId = (req as import("../middlewares/requireAuth").AuthenticatedRequest).userId;
  const targetId = Number(req.params.id);
  const parsed = adminUserUpdate.safeParse(req.body);
  if (!targetId || !parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error, "Invalid user ID") });
    return;
  }
  if (targetId === adminId && parsed.data.role && parsed.data.role !== "admin") {
    res.status(400).json({ error: "You cannot remove your own administrator access" });
    return;
  }
  const patch = { ...parsed.data };
  if (patch.websiteUrl === "") patch.websiteUrl = null;
  if (patch.role === "student") patch.activeRole = "student";
  if (patch.role === "teacher" && patch.activeRole === "admin") patch.activeRole = "teacher";
  if (patch.role === "admin") patch.activeRole = "admin";
  try {
    const [user] = await db.update(usersTable).set(patch)
      .where(eq(usersTable.id, targetId)).returning(adminUserSelection);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That email address is already in use" });
      return;
    }
    throw error;
  }
});

const affiliationUpdate = z.object({
  role: z.enum(["student", "teacher"]).optional(),
  teacherNote: z.string().trim().max(2000).nullable().optional(),
}).strict();

router.patch("/admin/users/:id/classes/:classId/membership", requireAdmin, async (req, res): Promise<void> => {
  const targetId = Number(req.params.id);
  const classId = Number(req.params.classId);
  const parsed = affiliationUpdate.safeParse(req.body);
  if (!targetId || !classId || !parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error, "Invalid affiliation") });
    return;
  }
  const [membership] = await db.update(classMembersTable).set(parsed.data)
    .where(and(eq(classMembersTable.userId, targetId), eq(classMembersTable.classId, classId)))
    .returning();
  if (!membership) {
    res.status(404).json({ error: "Class membership not found" });
    return;
  }
  res.json(membership);
});

const ownedClassUpdate = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  subject: z.string().trim().min(1).max(160).optional(),
  gradeLevel: z.string().trim().min(1).max(80).optional(),
}).strict();

router.patch("/admin/users/:id/classes/:classId", requireAdmin, async (req, res): Promise<void> => {
  const targetId = Number(req.params.id);
  const classId = Number(req.params.classId);
  const parsed = ownedClassUpdate.safeParse(req.body);
  if (!targetId || !classId || !parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error, "Invalid class") });
    return;
  }
  const [classroom] = await db.update(classesTable).set(parsed.data)
    .where(and(eq(classesTable.id, classId), eq(classesTable.teacherId, targetId))).returning();
  if (!classroom) {
    res.status(404).json({ error: "Owned class not found" });
    return;
  }
  res.json(classroom);
});

const workEditBody = z.object({
  primary: z.string().trim().min(1).max(500),
  secondary: z.string().trim().max(5000).nullable().optional(),
}).strict();

router.patch("/admin/users/:id/work/:category/:itemId", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const parsed = workEditBody.safeParse(req.body);
  if (!userId || !itemId || !parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error, "Invalid work item") });
    return;
  }
  const { primary, secondary = null } = parsed.data;
  let updated: unknown;
  switch (req.params.category) {
    case "goals": [updated] = await db.update(learningGoalsTable).set({ title: primary, description: secondary }).where(and(eq(learningGoalsTable.id, itemId), eq(learningGoalsTable.userId, userId))).returning(); break;
    case "resources": [updated] = await db.update(resourcesTable).set({ title: primary, description: secondary }).where(and(eq(resourcesTable.id, itemId), eq(resourcesTable.submittedById, userId))).returning(); break;
    case "materials": [updated] = await db.update(forumMaterialsTable).set({ title: primary, description: secondary, updatedAt: new Date().toISOString() }).where(and(eq(forumMaterialsTable.id, itemId), eq(forumMaterialsTable.uploaderId, userId))).returning(); break;
    case "posts": [updated] = await db.update(forumPostsTable).set({ title: primary, body: secondary || primary, updatedAt: new Date().toISOString() }).where(and(eq(forumPostsTable.id, itemId), eq(forumPostsTable.authorId, userId))).returning(); break;
    case "comments": [updated] = await db.update(forumCommentsTable).set({ body: primary }).where(and(eq(forumCommentsTable.id, itemId), eq(forumCommentsTable.authorId, userId))).returning(); break;
    case "activities": [updated] = await db.update(studyActivitiesTable).set({ title: primary, subject: secondary || "General", updatedAt: new Date().toISOString() }).where(and(eq(studyActivitiesTable.id, itemId), eq(studyActivitiesTable.ownerId, userId))).returning(); break;
    case "canvases": [updated] = await db.update(canvasesTable).set({ title: primary, description: secondary, updatedAt: new Date().toISOString() }).where(and(eq(canvasesTable.id, itemId), eq(canvasesTable.ownerId, userId))).returning(); break;
    case "lists": [updated] = await db.update(resourceListsTable).set({ name: primary, description: secondary }).where(and(eq(resourceListsTable.id, itemId), eq(resourceListsTable.ownerId, userId))).returning(); break;
    case "assignments": [updated] = await db.update(classAssignmentsTable).set({ title: primary, instructions: secondary || "" }).where(and(eq(classAssignmentsTable.id, itemId), eq(classAssignmentsTable.createdById, userId))).returning(); break;
    case "schedule": [updated] = await db.update(scheduleBlocksTable).set({ title: primary, notes: secondary }).where(and(eq(scheduleBlocksTable.id, itemId), eq(scheduleBlocksTable.userId, userId))).returning(); break;
    case "studySessions": [updated] = await db.update(studySessionsTable).set({ title: primary, topic: secondary || primary }).where(and(eq(studySessionsTable.id, itemId), eq(studySessionsTable.organizerId, userId))).returning(); break;
    case "learningEvidence": [updated] = await db.update(learningEvidenceTable).set({ concept: primary, reflection: secondary }).where(and(eq(learningEvidenceTable.id, itemId), eq(learningEvidenceTable.userId, userId))).returning(); break;
    default: res.status(400).json({ error: "Unsupported work category" }); return;
  }
  if (!updated) { res.status(404).json({ error: "Work item not found for this account" }); return; }
  res.json(updated);
});

router.delete("/admin/users/:id/work/:category/:itemId", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!userId || !itemId) { res.status(400).json({ error: "Invalid work item" }); return; }
  let deleted: unknown;
  switch (req.params.category) {
    case "goals": [deleted] = await db.delete(learningGoalsTable).where(and(eq(learningGoalsTable.id, itemId), eq(learningGoalsTable.userId, userId))).returning(); break;
    case "resources": [deleted] = await db.delete(resourcesTable).where(and(eq(resourcesTable.id, itemId), eq(resourcesTable.submittedById, userId))).returning(); break;
    case "materials": [deleted] = await db.delete(forumMaterialsTable).where(and(eq(forumMaterialsTable.id, itemId), eq(forumMaterialsTable.uploaderId, userId))).returning(); break;
    case "posts": [deleted] = await db.delete(forumPostsTable).where(and(eq(forumPostsTable.id, itemId), eq(forumPostsTable.authorId, userId))).returning(); break;
    case "comments": [deleted] = await db.delete(forumCommentsTable).where(and(eq(forumCommentsTable.id, itemId), eq(forumCommentsTable.authorId, userId))).returning(); break;
    case "activities": [deleted] = await db.delete(studyActivitiesTable).where(and(eq(studyActivitiesTable.id, itemId), eq(studyActivitiesTable.ownerId, userId))).returning(); break;
    case "canvases": [deleted] = await db.delete(canvasesTable).where(and(eq(canvasesTable.id, itemId), eq(canvasesTable.ownerId, userId))).returning(); break;
    case "lists": [deleted] = await db.delete(resourceListsTable).where(and(eq(resourceListsTable.id, itemId), eq(resourceListsTable.ownerId, userId))).returning(); break;
    case "assignments": [deleted] = await db.delete(classAssignmentsTable).where(and(eq(classAssignmentsTable.id, itemId), eq(classAssignmentsTable.createdById, userId))).returning(); break;
    case "schedule": [deleted] = await db.delete(scheduleBlocksTable).where(and(eq(scheduleBlocksTable.id, itemId), eq(scheduleBlocksTable.userId, userId))).returning(); break;
    case "studySessions": [deleted] = await db.delete(studySessionsTable).where(and(eq(studySessionsTable.id, itemId), eq(studySessionsTable.organizerId, userId))).returning(); break;
    case "learningEvidence": [deleted] = await db.delete(learningEvidenceTable).where(and(eq(learningEvidenceTable.id, itemId), eq(learningEvidenceTable.userId, userId))).returning(); break;
    default: res.status(400).json({ error: "Unsupported work category" }); return;
  }
  if (!deleted) { res.status(404).json({ error: "Work item not found for this account" }); return; }
  res.status(204).end();
});

router.get("/admin/users/:id/details", requireAdmin, async (req, res): Promise<void> => {
  const targetId = Number(req.params.id);
  if (!targetId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [user] = await db
    .select(adminUserSelection)
    .from(usersTable)
    .where(eq(usersTable.id, targetId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [
    ownedClasses,
    classMemberships,
    canvasCollaborations,
    goals,
    resources,
    materials,
    posts,
    comments,
    activities,
    canvases,
    lists,
    assignments,
    schedule,
    studySessions,
    learningEvidence,
  ] = await Promise.all([
    db
      .select({
        id: classesTable.id,
        name: classesTable.name,
        subject: classesTable.subject,
        gradeLevel: classesTable.gradeLevel,
        createdAt: classesTable.createdAt,
      })
      .from(classesTable)
      .where(eq(classesTable.teacherId, targetId))
      .orderBy(sql`${classesTable.createdAt} desc`),
    db
      .select({
        classId: classesTable.id,
        name: classesTable.name,
        subject: classesTable.subject,
        gradeLevel: classesTable.gradeLevel,
        role: classMembersTable.role,
        teacherNote: classMembersTable.teacherNote,
        joinedAt: classMembersTable.joinedAt,
      })
      .from(classMembersTable)
      .innerJoin(classesTable, eq(classMembersTable.classId, classesTable.id))
      .where(eq(classMembersTable.userId, targetId))
      .orderBy(sql`${classMembersTable.joinedAt} desc`),
    db
      .select({
        canvasId: canvasesTable.id,
        title: canvasesTable.title,
        role: canvasCollaboratorsTable.role,
        addedAt: canvasCollaboratorsTable.createdAt,
      })
      .from(canvasCollaboratorsTable)
      .innerJoin(canvasesTable, eq(canvasCollaboratorsTable.canvasId, canvasesTable.id))
      .where(eq(canvasCollaboratorsTable.userId, targetId))
      .orderBy(sql`${canvasCollaboratorsTable.createdAt} desc`),
    db
      .select({
        id: learningGoalsTable.id,
        title: learningGoalsTable.title,
        subject: learningGoalsTable.subject,
        description: learningGoalsTable.description,
        level: learningGoalsTable.level,
        status: learningGoalsTable.status,
        targetDate: learningGoalsTable.targetDate,
        pathSteps: learningGoalsTable.pathSteps,
        updatedAt: learningGoalsTable.updatedAt,
      })
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.userId, targetId))
      .orderBy(sql`${learningGoalsTable.updatedAt} desc`),
    db
      .select({
        id: resourcesTable.id,
        title: resourcesTable.title,
        url: resourcesTable.url,
        description: resourcesTable.description,
        format: resourcesTable.format,
        subject: resourcesTable.subject,
        gradeLevel: resourcesTable.gradeLevel,
        createdAt: resourcesTable.createdAt,
      })
      .from(resourcesTable)
      .where(eq(resourcesTable.submittedById, targetId))
      .orderBy(sql`${resourcesTable.createdAt} desc`),
    db
      .select({
        id: forumMaterialsTable.id,
        title: forumMaterialsTable.title,
        description: forumMaterialsTable.description,
        unit: forumMaterialsTable.unit,
        topic: forumMaterialsTable.topic,
        materialType: forumMaterialsTable.materialType,
        tags: forumMaterialsTable.tags,
        moderationStatus: forumMaterialsTable.moderationStatus,
        fileName: forumMaterialsTable.fileName,
        linkUrl: forumMaterialsTable.linkUrl,
        createdAt: forumMaterialsTable.createdAt,
      })
      .from(forumMaterialsTable)
      .where(eq(forumMaterialsTable.uploaderId, targetId))
      .orderBy(sql`${forumMaterialsTable.createdAt} desc`),
    db
      .select({
        id: forumPostsTable.id,
        classId: forumPostsTable.classId,
        kind: forumPostsTable.kind,
        title: forumPostsTable.title,
        body: forumPostsTable.body,
        tags: forumPostsTable.tags,
        moderationStatus: forumPostsTable.moderationStatus,
        createdAt: forumPostsTable.createdAt,
        updatedAt: forumPostsTable.updatedAt,
      })
      .from(forumPostsTable)
      .where(eq(forumPostsTable.authorId, targetId))
      .orderBy(sql`${forumPostsTable.updatedAt} desc`),
    db
      .select({
        id: forumCommentsTable.id,
        targetType: forumCommentsTable.targetType,
        targetId: forumCommentsTable.targetId,
        body: forumCommentsTable.body,
        moderationStatus: forumCommentsTable.moderationStatus,
        createdAt: forumCommentsTable.createdAt,
      })
      .from(forumCommentsTable)
      .where(eq(forumCommentsTable.authorId, targetId))
      .orderBy(sql`${forumCommentsTable.createdAt} desc`),
    db
      .select({
        id: studyActivitiesTable.id,
        classId: studyActivitiesTable.classId,
        title: studyActivitiesTable.title,
        subject: studyActivitiesTable.subject,
        cards: studyActivitiesTable.cards,
        updatedAt: studyActivitiesTable.updatedAt,
      })
      .from(studyActivitiesTable)
      .where(eq(studyActivitiesTable.ownerId, targetId))
      .orderBy(sql`${studyActivitiesTable.updatedAt} desc`),
    db
      .select({
        id: canvasesTable.id,
        classId: canvasesTable.classId,
        title: canvasesTable.title,
        description: canvasesTable.description,
        visibility: canvasesTable.visibility,
        document: canvasesTable.document,
        updatedAt: canvasesTable.updatedAt,
      })
      .from(canvasesTable)
      .where(eq(canvasesTable.ownerId, targetId))
      .orderBy(sql`${canvasesTable.updatedAt} desc`),
    db
      .select({
        id: resourceListsTable.id,
        classId: resourceListsTable.classId,
        name: resourceListsTable.name,
        description: resourceListsTable.description,
        createdAt: resourceListsTable.createdAt,
      })
      .from(resourceListsTable)
      .where(eq(resourceListsTable.ownerId, targetId))
      .orderBy(sql`${resourceListsTable.createdAt} desc`),
    db
      .select({
        id: classAssignmentsTable.id,
        classId: classAssignmentsTable.classId,
        title: classAssignmentsTable.title,
        instructions: classAssignmentsTable.instructions,
        dueAt: classAssignmentsTable.dueAt,
        createdAt: classAssignmentsTable.createdAt,
      })
      .from(classAssignmentsTable)
      .where(eq(classAssignmentsTable.createdById, targetId))
      .orderBy(sql`${classAssignmentsTable.createdAt} desc`),
    db
      .select({
        id: scheduleBlocksTable.id,
        classId: scheduleBlocksTable.classId,
        title: scheduleBlocksTable.title,
        date: scheduleBlocksTable.date,
        startTime: scheduleBlocksTable.startTime,
        endTime: scheduleBlocksTable.endTime,
        notes: scheduleBlocksTable.notes,
      })
      .from(scheduleBlocksTable)
      .where(eq(scheduleBlocksTable.userId, targetId))
      .orderBy(sql`${scheduleBlocksTable.date} desc`),
    db
      .select({
        id: studySessionsTable.id,
        title: studySessionsTable.title,
        topic: studySessionsTable.topic,
        startsAt: studySessionsTable.startsAt,
        durationMinutes: studySessionsTable.durationMinutes,
        meetingUrl: studySessionsTable.meetingUrl,
      })
      .from(studySessionsTable)
      .where(eq(studySessionsTable.organizerId, targetId))
      .orderBy(sql`${studySessionsTable.startsAt} desc`),
    db
      .select({
        id: learningEvidenceTable.id,
        concept: learningEvidenceTable.concept,
        confidence: learningEvidenceTable.confidence,
        understanding: learningEvidenceTable.understanding,
        reflection: learningEvidenceTable.reflection,
        misconception: learningEvidenceTable.misconception,
        createdAt: learningEvidenceTable.createdAt,
      })
      .from(learningEvidenceTable)
      .where(eq(learningEvidenceTable.userId, targetId))
      .orderBy(sql`${learningEvidenceTable.createdAt} desc`),
  ]);

  res.json({
    user,
    affiliations: { ownedClasses, classMemberships, canvasCollaborations },
    work: {
      goals,
      resources,
      materials,
      posts,
      comments,
      activities: activities.map(({ cards, ...activity }) => ({
        ...activity,
        cards: cards.map(({ imageData: _imageData, ...card }) => ({
          ...card,
          hasImage: Boolean(_imageData),
        })),
      })),
      canvases: canvases.map(({ document, ...canvas }) => ({
        ...canvas,
        nodes: document.nodes.map((node) => ({
          kind: node.data.kind,
          title: node.data.title,
          text: node.data.text,
          url: node.data.url,
          resourceId: node.data.resourceId,
        })),
        connectionCount: document.edges.length,
      })),
      lists,
      assignments,
      schedule,
      studySessions,
      learningEvidence,
    },
  });
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
  if (!targetId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  // Parse strictly: a malformed body used to be read as `verified === false`,
  // which silently REMOVED verification instead of rejecting the request.
  const body = z.object({ verified: z.boolean() }).strict().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Expected { verified: boolean }" });
    return;
  }
  const { verified } = body.data;

  const [target] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, targetId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Verification is an ACCOUNT-level trust flag (it lets a submitter's
  // resources publish without review), so students can hold it too. Admins are
  // trusted implicitly and are excluded, they also can never be role
  // "teacher", so the old teacher-only gate made allowlisted admins permanently
  // unverifiable.
  if (target.role === "admin") {
    res.status(400).json({ error: "Admin accounts are trusted implicitly" });
    return;
  }

  const { userId } = req as import("../middlewares/requireAuth").AuthenticatedRequest;
  const [user] = await db
    .update(usersTable)
    .set({
      teacherVerified: verified,
      verifiedAt: verified ? new Date().toISOString() : null,
      verifiedById: verified ? userId : null,
    })
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

// ── Resource verification review queue ──────────────────────────────────────
// Admin-only, and intentionally not part of the client OpenAPI surface, the
// admin page talks to these through its own adminRequest() helper, the same
// way the rest of /admin/* works.

const resourceVerificationBody = z
  .object({
    status: z.enum(["verified", "rejected", "unverified"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

// GET /admin/resources/review-queue, oldest first, so submissions cannot be
// starved by newer ones.
router.get(
  "/admin/resources/review-queue",
  requireAdmin,
  async (req, res): Promise<void> => {
    const status =
      typeof req.query.status === "string" &&
      ["unverified", "verified", "rejected"].includes(req.query.status)
        ? (req.query.status as "unverified" | "verified" | "rejected")
        : "unverified";
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const rows = await db
      .select({
        id: resourcesTable.id,
        title: resourcesTable.title,
        url: resourcesTable.url,
        description: resourcesTable.description,
        format: resourcesTable.format,
        subject: resourcesTable.subject,
        gradeLevel: resourcesTable.gradeLevel,
        thumbnailUrl: resourcesTable.thumbnailUrl,
        createdAt: resourcesTable.createdAt,
        verificationStatus: resourcesTable.verificationStatus,
        verificationSource: resourcesTable.verificationSource,
        verificationNote: resourcesTable.verificationNote,
        submittedById: resourcesTable.submittedById,
        submittedByName: usersTable.name,
        submittedByEmail: usersTable.email,
        submittedByRole: usersTable.role,
        submitterVerified: usersTable.teacherVerified,
      })
      .from(resourcesTable)
      .leftJoin(usersTable, eq(usersTable.id, resourcesTable.submittedById))
      .where(eq(resourcesTable.verificationStatus, status))
      .orderBy(resourcesTable.createdAt)
      .limit(limit)
      .offset(offset);

    const [counts] = await db
      .select({ pending: sql<number>`cast(count(*) as int)` })
      .from(resourcesTable)
      .where(eq(resourcesTable.verificationStatus, "unverified"));

    res.json({ items: rows, pendingTotal: counts?.pending ?? 0 });
  },
);

// PATCH /admin/resources/:id/verification, approve, reject, or send back.
router.patch(
  "/admin/resources/:id/verification",
  requireAdmin,
  async (req, res): Promise<void> => {
    const resourceId = Number(req.params.id);
    if (!resourceId) {
      res.status(400).json({ error: "Invalid resource ID" });
      return;
    }
    const parsed = resourceVerificationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Expected { status: verified | rejected | unverified, note? }",
      });
      return;
    }
    const { status, note } = parsed.data;
    // A rejection has to say why, that reason is the only thing the submitter
    // can act on.
    if (status === "rejected" && !note) {
      res.status(400).json({ error: "A note is required when rejecting" });
      return;
    }

    const [resource] = await db
      .update(resourcesTable)
      .set({
        verificationStatus: status,
        verificationSource: status === "unverified" ? null : "reviewer",
        verificationNote: note ?? null,
      })
      .where(eq(resourcesTable.id, resourceId))
      .returning({
        id: resourcesTable.id,
        title: resourcesTable.title,
        verificationStatus: resourcesTable.verificationStatus,
        verificationNote: resourcesTable.verificationNote,
      });
    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    res.json(resource);
  },
);

// POST /admin/resources/verification/bulk, the difference between a queue and
// a backlog when one person is reviewing.
router.post(
  "/admin/resources/verification/bulk",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = z
      .object({
        ids: z.array(z.number().int().positive()).min(1).max(100),
        status: z.enum(["verified", "rejected", "unverified"]),
        note: z.string().trim().max(1000).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Expected { ids: number[], status, note? }" });
      return;
    }
    const { ids, status, note } = parsed.data;
    if (status === "rejected" && !note) {
      res.status(400).json({ error: "A note is required when rejecting" });
      return;
    }
    const updated = await db
      .update(resourcesTable)
      .set({
        verificationStatus: status,
        verificationSource: status === "unverified" ? null : "reviewer",
        verificationNote: note ?? null,
      })
      .where(inArray(resourcesTable.id, ids))
      .returning({ id: resourcesTable.id });
    res.json({ updated: updated.length });
  },
);

export default router;
