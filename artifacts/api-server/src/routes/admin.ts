import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
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
      readUsageRows(
        `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
         FROM rate_limit_hits WHERE key = ANY($1::text[])`,
        [["ai-search-daily:all-ai-searches", "deep-global-day:all"]],
      ),
      readUsageRows(
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
      usageResult.map((row) => [row.key, Number(row.hits)]),
    );
    const counters = new Map(
      allUsageResult.map((row) => [row.key, Number(row.hits)]),
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
    res.status(400).json({ error: parsed.success ? "Invalid user ID" : parsed.error.message });
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
    res.status(400).json({ error: parsed.success ? "Invalid affiliation" : parsed.error.message });
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
    res.status(400).json({ error: parsed.success ? "Invalid class" : parsed.error.message });
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
    res.status(400).json({ error: parsed.success ? "Invalid work item" : parsed.error.message });
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
