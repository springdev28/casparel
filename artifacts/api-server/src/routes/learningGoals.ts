/**
 * @fileOverview API role: implements the Learning Goals HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  learningGoalsTable,
  goalPathTemplatesTable,
  classMembersTable,
  learningEvidenceTable,
  resourcesTable,
  usersTable,
  activityLogTable,
} from "@workspace/db";
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
  LinkGoalResourceParams,
  LinkGoalResourceBody,
  LinkGoalResourceResponse,
  CompleteGoalStepParams,
  CompleteGoalStepBody,
  CompleteGoalStepResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { isClassTeacher } from "../lib/authz";
import { ensureAccountCapacity } from "../lib/planCapacity";
import { validationMessage } from "../lib/validationMessage";
import { recordWorkflowEvent } from "../lib/workflowAnalytics";
import { dateOnly } from "../lib/contractDates";
import { resourceVisibilityCondition } from "../lib/resourceVisibility";
import { isAdminRequest } from "../lib/adminAccess";

const router: IRouter = Router();

/**
 * A goal as the contract says it looks, with `targetDate` a plain YYYY-MM-DD.
 *
 * Every response here goes through a generated schema, and the contract calls
 * targetDate a date, so orval made it `zod.coerce.date()` -- the parse turns
 * the database's "2026-12-01" into a Date and res.json writes it back as
 * "2026-12-01T00:00:00.000Z". The web app binds that value to an
 * `<input type="date">`, which renders anything that is not YYYY-MM-DD as an
 * empty field: a learner opening Edit on a goal with a target date was shown
 * none, and the goal's own date was one tap from being cleared.
 *
 * See lib/contractDates.ts. The same defect made every schedule block
 * invisible on every phone before it was found there.
 */
function asContract<T extends { targetDate?: Date | string | null }>(
  goal: T,
): T & { targetDate?: string | null } {
  // A goal with no target date keeps the key it arrived with: the parse makes
  // it optional, and res.json drops an undefined rather than sending a null
  // where the client was typed to expect nothing.
  return { ...goal, targetDate: dateOnly(goal.targetDate) };
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
  res.json(
    ListClassStudentGoalsResponse.parse(
      rows.map((row) => ({ ...row.goal, studentName: row.studentName, classId })),
    ).map(asContract),
  );
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
    targetDate: dateOnly(body.data.targetDate),
    updatedAt: new Date().toISOString(),
  }).where(eq(learningGoalsTable.id, goalId)).returning();
  await db.insert(activityLogTable).values({
    userId: goal.userId,
    type: "class",
    workspaceRole: "student",
    message: `Your teacher updated your goal "${goal.title}".`,
  });
  res.json(
    asContract(
      UpdateClassStudentGoalResponse.parse({
        ...goal,
        studentName: existing.studentName,
        classId,
      }),
    ),
  );
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
    const pathSteps = goal.pathSteps.map((step) => ({
      ...step,
      completed: false,
    }));
    const [template] = await db
      .insert(goalPathTemplatesTable)
      .values({
        creatorId: userId,
        creatorName: creator?.name ?? "Casparel member",
        sourceGoalId: goal.id,
        title: goal.title,
        subject: goal.subject,
        description: goal.description,
        level: goal.level,
        pathSteps,
      })
      .onConflictDoUpdate({
        target: [
          goalPathTemplatesTable.creatorId,
          goalPathTemplatesTable.sourceGoalId,
        ],
        set: {
          creatorName: creator?.name ?? "Casparel member",
          title: goal.title,
          subject: goal.subject,
          description: goal.description,
          level: goal.level,
          pathSteps,
          createdAt: new Date().toISOString(),
        },
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
          id: randomUUID(),
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
  res.json(ListLearningGoalsResponse.parse(goals).map(asContract));
});

router.post(
  "/learning-goals",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const body = CreateLearningGoalBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: validationMessage(body.error) });
      return;
    }
    if (!(await ensureAccountCapacity(res, userId, "learning-goals"))) return;
    const [goal] = await db
      .insert(learningGoalsTable)
      .values({
        ...body.data,
        targetDate: dateOnly(body.data.targetDate),
        userId,
        workspaceRole: userRole as "student" | "teacher",
        preferredFormats: body.data.preferredFormats ?? null,
        pathSteps: initialPath(body.data.title, body.data.subject),
      })
      .returning();
    res.status(201).json(asContract(CreateLearningGoalResponse.parse(goal)));
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
        targetDate: dateOnly(body.data.targetDate),
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
    res.json(asContract(UpdateLearningGoalResponse.parse(goal)));
  },
);

/**
 * Mark one step done, or not done, and record how it went.
 *
 * This is the study end of the product's spine: a path step is where somebody
 * actually works, and completing one is the only moment the app learns
 * anything about how it went. So the check-in rides along with the tick --
 * "Not yet", "Almost", "I can", the same three answers the dashboard has asked
 * since check-ins existed, which is what lets a teacher's signals aggregate
 * across both.
 *
 * The check-in is optional and nothing is invented when it is skipped. A tick
 * with no answer records that the step is done and claims nothing about
 * understanding, because the alternative -- writing a middling number on the
 * learner's behalf -- would put a sentence in a teacher's dashboard that
 * nobody said.
 *
 * One step, under the goal's lock, rather than the whole path. The phone used
 * to send the entire pathSteps array for a tick, which is a lost update
 * waiting to happen: two devices, or a tick and an attachment, and whichever
 * wrote second erased the other's work. Here the array is read and written
 * inside the transaction and only the named step moves.
 *
 * Unticking leaves the evidence alone. A check-in is a record of what somebody
 * said at a moment, not a property of the step, and deleting it because a box
 * was cleared would quietly rewrite the history a teacher is reading.
 */
router.post(
  "/learning-goals/:id/steps/:stepId/completion",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = CompleteGoalStepParams.safeParse(req.params);
    const body = CompleteGoalStepBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: validationMessage(params.error) });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: validationMessage(body.error) });
      return;
    }
    // Both halves of a check-in or neither: an understanding with no
    // confidence beside it is half an answer, and the columns are not null.
    const checkIn =
      body.data.understanding !== undefined && body.data.confidence !== undefined
        ? {
            understanding: body.data.understanding,
            confidence: body.data.confidence,
            reflection: body.data.reflection ?? null,
          }
        : null;
    if (
      !checkIn &&
      (body.data.understanding !== undefined || body.data.confidence !== undefined)
    ) {
      res.status(400).json({
        error: "A check-in needs both understanding and confidence, or neither",
      });
      return;
    }

    const done = await db.transaction(async (tx) => {
      // The goal's own lane, shared with resource attachment: both rewrite the
      // path, and two of them at once is how a step goes missing.
      await tx.execute(sql`select pg_advisory_xact_lock(${params.data.id}, 1)`);
      const [goal] = await tx
        .select()
        .from(learningGoalsTable)
        .where(
          and(
            eq(learningGoalsTable.id, params.data.id),
            eq(learningGoalsTable.userId, userId),
            eq(
              learningGoalsTable.workspaceRole,
              userRole === "teacher" ? "teacher" : "student",
            ),
          ),
        );
      if (!goal) return { missing: "goal" as const };

      const step = goal.pathSteps.find(
        (candidate) => candidate.id === params.data.stepId,
      );
      if (!step) return { missing: "step" as const };

      const [existingEvidence] = checkIn
        ? await tx
            .select({ id: learningEvidenceTable.id })
            .from(learningEvidenceTable)
            .where(
              and(
                eq(learningEvidenceTable.learningGoalId, goal.id),
                eq(learningEvidenceTable.pathStepId, step.id),
              ),
            )
            .limit(1)
        : [];

      const alreadyRecorded =
        step.completed === body.data.completed &&
        (!checkIn || Boolean(existingEvidence));

      const pathSteps =
        step.completed === body.data.completed
          ? goal.pathSteps
          : goal.pathSteps.map((candidate) =>
              candidate.id === step.id
                ? { ...candidate, completed: body.data.completed }
                : candidate,
            );

      const [updated] =
        pathSteps === goal.pathSteps
          ? [goal]
          : await tx
              .update(learningGoalsTable)
              .set({ pathSteps, updatedAt: new Date().toISOString() })
              .where(eq(learningGoalsTable.id, goal.id))
              .returning();

      // A check-in belongs to a step that is done, and only the first one:
      // ticking, unticking and ticking again is one piece of evidence.
      const [evidence] =
        checkIn && body.data.completed && !existingEvidence
          ? await tx
              .insert(learningEvidenceTable)
              .values({
                userId,
                resourceId: step.resourceId ?? null,
                learningGoalId: goal.id,
                pathStepId: step.id,
                // The step's own words are the concept, which is what the
                // learner was working on and what a teacher will read.
                concept: step.title.slice(0, 160),
                confidence: checkIn.confidence,
                understanding: checkIn.understanding,
                reflection: checkIn.reflection,
              })
              .returning()
          : [];

      return { goal: updated, step, evidence: evidence ?? null, alreadyRecorded };
    });

    if ("missing" in done) {
      res.status(404).json({
        error: done.missing === "goal" ? "Learning goal not found" : "Step not found",
      });
      return;
    }

    if (body.data.completed && !done.alreadyRecorded) {
      await recordWorkflowEvent({
        userId,
        event: "path_step_completed",
        resourceId: done.step.resourceId ?? null,
        context: { goalId: done.goal.id, stepId: done.step.id },
      });
    }

    /*
     * The next thing to do, which is what the learner asked for by finishing
     * this one. The first step still outstanding in the path's own order --
     * not a recommendation, just the next one.
     */
    const nextStep =
      done.goal.pathSteps.find((candidate) => !candidate.completed) ?? null;

    res.json(
      CompleteGoalStepResponse.parse({
        goal: asContract(done.goal),
        evidence: done.evidence,
        nextStep,
        alreadyRecorded: done.alreadyRecorded,
      }),
    );
  },
);

/**
 * Attach a saved resource to a goal's path.
 *
 * This is the link the save sheet used to be honest about not having: a
 * learner could save a resource and then look at their goals, and nothing
 * connected the two. A step now carries the resource it is about, so the goal
 * screen can open it and the path stops being four search intents.
 *
 * Idempotent, and it has to be. The sheet is a phone sheet, and the second tap
 * of a double tap arrives while the first is still in flight. Both would read
 * a path without the resource and both would append a step, leaving the same
 * resource on the path twice with two ids and no way for the learner to tell
 * which is which. The advisory lock is the goal's own append lane, so the two
 * taps queue and the second finds the first one's step and reports it as
 * already there rather than as an error.
 *
 * The lane is (goal id, 1); Learning List appends hold (list id, 0). Goal and
 * list ids overlap, and the second key is what keeps an unrelated list append
 * from waiting behind a goal append.
 */
router.post(
  "/learning-goals/:id/resources",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = LinkGoalResourceParams.safeParse(req.params);
    const body = LinkGoalResourceBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: validationMessage(params.error) });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: validationMessage(body.error) });
      return;
    }

    /*
     * The resource has to be one this account can already see. Without the
     * visibility condition, attaching would answer with the title of a
     * submission still in the review queue -- a read of somebody else's
     * unpublished work through a write endpoint.
     */
    const [resource] = await db
      .select({
        id: resourcesTable.id,
        title: resourcesTable.title,
        subject: resourcesTable.subject,
      })
      .from(resourcesTable)
      .where(
        and(
          eq(resourcesTable.id, body.data.resourceId),
          resourceVisibilityCondition(userId, isAdminRequest(req)),
        ),
      );
    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    const linked = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${params.data.id}, 1)`);
      const [goal] = await tx
        .select()
        .from(learningGoalsTable)
        .where(
          and(
            eq(learningGoalsTable.id, params.data.id),
            eq(learningGoalsTable.userId, userId),
            eq(
              learningGoalsTable.workspaceRole,
              userRole === "teacher" ? "teacher" : "student",
            ),
          ),
        );
      if (!goal) return null;

      const existing = goal.pathSteps.find(
        (step) => step.resourceId === resource.id,
      );
      if (existing) {
        return { goal, stepId: existing.id, alreadyLinked: true };
      }

      // A resource title is not length-bounded the way a step title is, and a
      // step longer than the contract allows would fail the response parse
      // after the write had already landed.
      const title = resource.title.trim().slice(0, 200) || "Saved resource";
      const step = {
        id: randomUUID(),
        title,
        query: `${resource.subject} ${title}`.trim().slice(0, 300),
        completed: false,
        resourceId: resource.id,
      };
      const [updated] = await tx
        .update(learningGoalsTable)
        .set({
          pathSteps: [...goal.pathSteps, step],
          updatedAt: new Date().toISOString(),
        })
        .where(eq(learningGoalsTable.id, goal.id))
        .returning();
      return { goal: updated, stepId: step.id, alreadyLinked: false };
    });

    if (!linked) {
      res.status(404).json({ error: "Learning goal not found" });
      return;
    }

    // One milestone per resource that reached a path, so a second tap cannot
    // inflate the count of learners who connected a save to a goal.
    if (!linked.alreadyLinked) {
      await recordWorkflowEvent({
        userId,
        event: "resource_linked_to_goal",
        resourceId: resource.id,
        context: { goalId: linked.goal.id, stepId: linked.stepId },
      });
    }

    res.status(linked.alreadyLinked ? 200 : 201).json(
      asContract(
        LinkGoalResourceResponse.parse({
          ...linked.goal,
          stepId: linked.stepId,
          alreadyLinked: linked.alreadyLinked,
        }),
      ),
    );
  },
);

router.delete(
  "/learning-goals/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = DeleteLearningGoalParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: validationMessage(params.error) });
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
