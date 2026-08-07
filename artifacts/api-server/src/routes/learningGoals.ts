import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, learningGoalsTable, goalPathTemplatesTable, classMembersTable, usersTable, activityLogTable } from "@workspace/db";
import {
  CreateLearningGoalBody,
  CreateLearningGoalResponse,
  DeleteLearningGoalParams,
  ListLearningGoalsResponse,
  UpdateLearningGoalBody,
  UpdateLearningGoalParams,
  UpdateLearningGoalResponse,
  ListClassStudentGoalsResponse,
  UpdateClassStudentGoalBody,
  UpdateClassStudentGoalResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { isClassTeacher } from "../lib/authz";

const router: IRouter = Router();
function dateString(
  value: Date | string | null | undefined,
): string | null | undefined {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function initialPath(title: string, subject: string) {
  const base = title.trim();
  return [
    {
      id: "foundations",
      title: "Learn the foundations of " + base,
      query: subject + " " + base + " foundations",
      completed: false,
    },
    {
      id: "guided-practice",
      title: "Practice " + base + " with guidance",
      query: subject + " " + base + " guided practice",
      completed: false,
    },
    {
      id: "apply",
      title: "Apply " + base + " independently",
      query: subject + " " + base + " exercises",
      completed: false,
    },
    {
      id: "reflect",
      title: "Review and explain " + base,
      query: subject + " " + base + " review",
      completed: false,
    },
  ];
}

// Teacher view of goals belonging to students enrolled in an owned class.
router.get("/classes/:id/student-goals", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  if (!classId || !(await isClassTeacher(classId, userId))) {
    res.status(403).json({ error: "Only the class teacher can manage student goals" });
    return;
  }
  const rows = await db
    .select({ goal: learningGoalsTable, studentName: usersTable.name })
    .from(learningGoalsTable)
    .innerJoin(classMembersTable, and(
      eq(classMembersTable.userId, learningGoalsTable.userId),
      eq(classMembersTable.classId, classId),
      eq(classMembersTable.role, "student"),
    ))
    .innerJoin(usersTable, eq(usersTable.id, learningGoalsTable.userId))
    .where(eq(learningGoalsTable.workspaceRole, "student"))
    .orderBy(desc(learningGoalsTable.updatedAt));
  res.json(ListClassStudentGoalsResponse.parse(rows.map((row) => ({ ...row.goal, studentName: row.studentName, classId }))));
});

router.patch("/classes/:id/student-goals/:goalId", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  const goalId = Number(req.params.goalId);
  const body = UpdateClassStudentGoalBody.safeParse(req.body);
  if (!classId || !goalId || !body.success) {
    res.status(400).json({ error: "Invalid student goal update" });
    return;
  }
  if (!(await isClassTeacher(classId, userId))) {
    res.status(403).json({ error: "Only the class teacher can manage student goals" });
    return;
  }
  const [existing] = await db
    .select({ goal: learningGoalsTable, studentName: usersTable.name })
    .from(learningGoalsTable)
    .innerJoin(classMembersTable, and(
      eq(classMembersTable.userId, learningGoalsTable.userId),
      eq(classMembersTable.classId, classId),
      eq(classMembersTable.role, "student"),
    ))
    .innerJoin(usersTable, eq(usersTable.id, learningGoalsTable.userId))
    .where(and(eq(learningGoalsTable.id, goalId), eq(learningGoalsTable.workspaceRole, "student")));
  if (!existing) {
    res.status(404).json({ error: "Student goal not found in this class" });
    return;
  }
  const [goal] = await db.update(learningGoalsTable).set({
    ...body.data,
    targetDate: dateString(body.data.targetDate),
    updatedAt: new Date().toISOString(),
  }).where(eq(learningGoalsTable.id, goalId)).returning();
  await db.insert(activityLogTable).values({
    userId: goal.userId,
    type: "class",
    workspaceRole: "student",
    message: `Your teacher updated your goal "${goal.title}".`,
  });
  res.json(UpdateClassStudentGoalResponse.parse({ ...goal, studentName: existing.studentName, classId }));
});

router.get("/learning-goal-templates", requireAuth, async (_req, res): Promise<void> => {
  const templates = await db
    .select()
    .from(goalPathTemplatesTable)
    .orderBy(desc(goalPathTemplatesTable.useCount), desc(goalPathTemplatesTable.createdAt))
    .limit(50);
  res.json(templates);
});

router.post(
  "/learning-goal-templates",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const goalId = Number(req.body?.goalId);
    if (!Number.isInteger(goalId) || goalId <= 0) {
      res.status(400).json({ error: "A valid goal is required" });
      return;
    }
    const [goal] = await db
      .select()
      .from(learningGoalsTable)
      .where(
        and(
          eq(learningGoalsTable.id, goalId),
          eq(learningGoalsTable.userId, userId),
          eq(
            learningGoalsTable.workspaceRole,
            userRole === "teacher" ? "teacher" : "student",
          ),
        ),
      );
    if (!goal) {
      res.status(404).json({ error: "Learning goal not found" });
      return;
    }
    if (!goal.pathSteps.length) {
      res.status(400).json({ error: "Add at least one path step before sharing" });
      return;
    }
    const [creator] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const [template] = await db
      .insert(goalPathTemplatesTable)
      .values({
        creatorId: userId,
        creatorName: creator?.name ?? "Schoolar member",
        title: goal.title,
        subject: goal.subject,
        description: goal.description,
        level: goal.level,
        pathSteps: goal.pathSteps.map((step) => ({
          ...step,
          completed: false,
        })),
      })
      .returning();
    res.status(201).json(template);
  },
);

router.post(
  "/learning-goal-templates/:id/clone",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      res.status(400).json({ error: "Invalid community path" });
      return;
    }
    const [template] = await db
      .select()
      .from(goalPathTemplatesTable)
      .where(eq(goalPathTemplatesTable.id, templateId));
    if (!template) {
      res.status(404).json({ error: "Community path not found" });
      return;
    }
    const [goal] = await db
      .insert(learningGoalsTable)
      .values({
        userId,
        workspaceRole: userRole === "teacher" ? "teacher" : "student",
        title: template.title,
        subject: template.subject,
        description: template.description,
        level: template.level,
        preferredFormats: null,
        pathSteps: template.pathSteps.map((step) => ({
          ...step,
          id: crypto.randomUUID(),
          completed: false,
        })),
      })
      .returning();
    await db
      .update(goalPathTemplatesTable)
      .set({ useCount: sql`${goalPathTemplatesTable.useCount} + 1` })
      .where(eq(goalPathTemplatesTable.id, templateId));
    res.status(201).json(goal);
  },
);

router.get("/learning-goals", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const goals = await db
    .select()
    .from(learningGoalsTable)
    .where(and(eq(learningGoalsTable.userId, userId), eq(learningGoalsTable.workspaceRole, userRole as "student" | "teacher")))
    .orderBy(desc(learningGoalsTable.updatedAt));
  res.json(ListLearningGoalsResponse.parse(goals));
});

router.post(
  "/learning-goals",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const body = CreateLearningGoalBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [goal] = await db
      .insert(learningGoalsTable)
      .values({
        ...body.data,
        targetDate: dateString(body.data.targetDate),
        userId,
        workspaceRole: userRole as "student" | "teacher",
        preferredFormats: body.data.preferredFormats ?? null,
        pathSteps: initialPath(body.data.title, body.data.subject),
      })
      .returning();
    res.status(201).json(CreateLearningGoalResponse.parse(goal));
  },
);

router.patch(
  "/learning-goals/:id",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = UpdateLearningGoalParams.safeParse(req.params);
    const body = UpdateLearningGoalBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid learning goal update" });
      return;
    }
    const [goal] = await db
      .update(learningGoalsTable)
      .set({
        ...body.data,
        targetDate: dateString(body.data.targetDate),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(learningGoalsTable.id, params.data.id),
          eq(learningGoalsTable.userId, userId),
          eq(learningGoalsTable.workspaceRole, userRole as "student" | "teacher"),
        ),
      )
      .returning();
    if (!goal) {
      res.status(404).json({ error: "Learning goal not found" });
      return;
    }
    res.json(UpdateLearningGoalResponse.parse(goal));
  },
);

router.delete(
  "/learning-goals/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = DeleteLearningGoalParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const removed = await db
      .delete(learningGoalsTable)
      .where(
        and(
          eq(learningGoalsTable.id, params.data.id),
          eq(learningGoalsTable.userId, userId),
          eq(learningGoalsTable.workspaceRole, userRole as "student" | "teacher"),
        ),
      )
      .returning({ id: learningGoalsTable.id });
    if (!removed.length) {
      res.status(404).json({ error: "Learning goal not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
