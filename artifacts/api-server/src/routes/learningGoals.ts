/**
 * @fileOverview API role: implements the Learning Goals HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  learningGoalsTable,
  goalPathTemplatesTable,
  classMembersTable,
  learningEvidenceTable,
  listItemsTable,
  resourceListsTable,
  resourcesTable,
  studyActivitiesTable,
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
  GetStepActivityParams,
  GetStepActivityResponse,
  GetGoalListDriftParams,
  GetGoalListDriftResponse,
  AddStepsFromListParams,
  AddStepsFromListResponse,
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
import { publicResourceColumns } from "../lib/resourceColumns";
import { resourceWithRating, resourcesWithRatings } from "../lib/resourceRatings";
import { suggestStepActivity } from "../lib/stepActivity";
import {
  listResourcesMissingFromPath,
  pathStepForResource,
} from "../lib/goalPath";
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
 * What to do with this step.
 *
 * The specification asks the study session to choose an activity according to
 * the material and the goal. The rules are in lib/stepActivity.ts and rest on
 * three facts this product actually holds: what the material is, what the
 * learner said it was for in the list the path came from, and whether they
 * have a study set in the subject.
 *
 * The role is worth the join. A path built from a Learning List carries the
 * resource ids but not the roles, and the role is the only place the learner
 * has said anything about what a resource is *for* -- so a video they marked
 * as the thing to practise on is offered as practice rather than as watching.
 *
 * Nothing is generated. Every branch offers something that exists here, and
 * the step is still finished by the learner saying so.
 */
router.get(
  "/learning-goals/:id/steps/:stepId/activity",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = GetStepActivityParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: validationMessage(params.error) });
      return;
    }
    const workspaceRole = userRole === "teacher" ? "teacher" : "student";
    const [goal] = await db
      .select()
      .from(learningGoalsTable)
      .where(
        and(
          eq(learningGoalsTable.id, params.data.id),
          eq(learningGoalsTable.userId, userId),
          eq(learningGoalsTable.workspaceRole, workspaceRole),
        ),
      );
    if (!goal) {
      res.status(404).json({ error: "Learning goal not found" });
      return;
    }
    const step = goal.pathSteps.find(
      (candidate) => candidate.id === params.data.stepId,
    );
    if (!step) {
      res.status(404).json({ error: "Step not found" });
      return;
    }

    const [resourceRow, roleRow, recall] = await Promise.all([
      step.resourceId
        ? db
            .select(publicResourceColumns)
            .from(resourcesTable)
            .where(
              and(
                eq(resourcesTable.id, step.resourceId),
                resourceVisibilityCondition(userId, isAdminRequest(req)),
              ),
            )
        : Promise.resolve([]),
      // The role the learner gave this resource, in the list this path came
      // from. Only that list: a role they set somewhere else is about a
      // different arrangement of the same resource.
      step.resourceId && goal.sourceListId
        ? db
            .select({ role: listItemsTable.role })
            .from(listItemsTable)
            .where(
              and(
                eq(listItemsTable.listId, goal.sourceListId),
                eq(listItemsTable.resourceId, step.resourceId),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
      db
        .select({
          id: studyActivitiesTable.id,
          title: studyActivitiesTable.title,
          mode: studyActivitiesTable.mode,
        })
        .from(studyActivitiesTable)
        .where(
          and(
            eq(studyActivitiesTable.ownerId, userId),
            eq(studyActivitiesTable.workspaceRole, workspaceRole),
            eq(studyActivitiesTable.subject, goal.subject),
          ),
        )
        .orderBy(desc(studyActivitiesTable.id))
        .limit(1),
    ]);

    const suggestion = suggestStepActivity({
      format: resourceRow[0]?.format ?? null,
      role: roleRow[0]?.role ?? null,
      recallActivityId: recall[0]?.id ?? null,
    });

    res.json(
      GetStepActivityResponse.parse({
        kind: suggestion.kind,
        because: suggestion.because,
        resource: resourceRow[0]
          ? await resourceWithRating(resourceRow[0].id)
          : null,
        query: suggestion.kind === "find" ? step.query : null,
        recallActivity: recall[0] ?? null,
      }),
    );
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

      const step = pathStepForResource(resource);
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

/**
 * The resources a list holds, in the list's order, as this reader may see them.
 *
 * Shared by the drift read and the catch-up write on purpose: they answer the
 * same question a moment apart, and a visibility condition or an ordering that
 * differed between them would have the screen offer resources the write then
 * silently declined to add, or add them in an order the preview did not show.
 */
type GoalTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function listResourcesInOrder(
  executor: typeof db | GoalTransaction,
  listId: number,
  userId: number,
  isAdmin: boolean,
) {
  return executor
    .select({
      id: resourcesTable.id,
      title: resourcesTable.title,
      subject: resourcesTable.subject,
    })
    .from(listItemsTable)
    .innerJoin(resourcesTable, eq(resourcesTable.id, listItemsTable.resourceId))
    .where(
      and(
        eq(listItemsTable.listId, listId),
        resourceVisibilityCondition(userId, isAdmin),
      ),
    )
    .orderBy(asc(listItemsTable.position), asc(listItemsTable.addedAt));
}

/**
 * The list a path came from, and what it has gained since.
 *
 * `sourceListId` records where a path came from, which was enough to link back
 * to the list and no help at all once the list moved on: a learner adds three
 * resources to their Learning List in October and the path built in September
 * never mentions them. Nothing was wrong, and nothing said so either.
 *
 * Additions only, and computed rather than stored. lib/goalPath.ts has the
 * reasoning for both.
 */
router.get(
  "/learning-goals/:id/list-drift",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = GetGoalListDriftParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: validationMessage(params.error) });
      return;
    }
    const workspaceRole = userRole === "teacher" ? "teacher" : "student";
    const [goal] = await db
      .select()
      .from(learningGoalsTable)
      .where(
        and(
          eq(learningGoalsTable.id, params.data.id),
          eq(learningGoalsTable.userId, userId),
          eq(learningGoalsTable.workspaceRole, workspaceRole),
        ),
      );
    // A goal that was never built from a list, and a goal whose list has since
    // been deleted, are the same answer: there is nothing to be behind.
    if (!goal?.sourceListId) {
      res.status(404).json({ error: "This goal was not built from a list" });
      return;
    }

    const [list] = await db
      .select({ id: resourceListsTable.id, name: resourceListsTable.name })
      .from(resourceListsTable)
      .where(eq(resourceListsTable.id, goal.sourceListId));
    if (!list) {
      res.status(404).json({ error: "This goal was not built from a list" });
      return;
    }

    const inList = await listResourcesInOrder(
      db,
      goal.sourceListId,
      userId,
      isAdminRequest(req),
    );
    const missing = listResourcesMissingFromPath(
      goal.pathSteps,
      inList.map((row) => row.id),
    );

    res.json(
      GetGoalListDriftResponse.parse({
        listId: list.id,
        listName: list.name,
        added: await resourcesWithRatings(missing),
      }),
    );
  },
);

/**
 * Bring the list's new resources onto the path.
 *
 * Append only: every existing step is left exactly as it was, which is what
 * keeps a finished step finished and its check-in attached. Under the goal's
 * own lane, like every other write that rewrites the path, so two taps cannot
 * each read a path without the new resources and each append them.
 */
router.post(
  "/learning-goals/:id/steps/from-list",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = AddStepsFromListParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: validationMessage(params.error) });
      return;
    }
    const isAdmin = isAdminRequest(req);

    const done = await db.transaction(async (tx) => {
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
      if (!goal?.sourceListId) return null;

      const rows = await listResourcesInOrder(
        tx,
        goal.sourceListId,
        userId,
        isAdmin,
      );

      const byId = new Map(rows.map((row) => [row.id, row]));
      const missing = listResourcesMissingFromPath(
        goal.pathSteps,
        rows.map((row) => row.id),
      );
      // Nothing to do is a success with an empty list, not an error: the
      // second of two taps arrives here and the learner has what they asked
      // for either way.
      if (missing.length === 0) return { goal, steps: [] };

      const steps = missing.flatMap((id) => {
        const row = byId.get(id);
        return row ? [pathStepForResource(row)] : [];
      });
      const [updated] = await tx
        .update(learningGoalsTable)
        .set({
          pathSteps: [...goal.pathSteps, ...steps],
          updatedAt: new Date().toISOString(),
        })
        .where(eq(learningGoalsTable.id, goal.id))
        .returning();
      return { goal: updated, steps };
    });

    if (!done) {
      res.status(404).json({ error: "This goal was not built from a list" });
      return;
    }

    // The same milestone the single attach writes, once per resource that
    // actually reached the path, so catching up and attaching by hand count
    // the same way.
    for (const step of done.steps) {
      await recordWorkflowEvent({
        userId,
        event: "resource_linked_to_goal",
        resourceId: step.resourceId,
        context: { goalId: done.goal.id, stepId: step.id },
      });
    }

    res.json(
      AddStepsFromListResponse.parse({
        goal: asContract(done.goal),
        addedStepIds: done.steps.map((step) => step.id),
      }),
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
