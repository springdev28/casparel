import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  assignmentCompletionsTable,
  classAssignmentsTable,
  classMembersTable,
  classesTable,
  db,
  listItemsTable,
  resourceListsTable,
  resourcesTable,
  studyActivitiesTable,
  workflowEventsTable,
} from "@workspace/db";
import { contentLimiter } from "../lib/limiters";
import { isClassMember, isClassTeacher } from "../lib/authz";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { recordWorkflowEvent } from "../lib/workflowAnalytics";
import { ensureClassMemberCapacity } from "../lib/planCapacity";
import { nextResourceWorkflowAction } from "../lib/workflowState";

const router: IRouter = Router();

function parseId(value: string | string[] | undefined) {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function createJoinCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function assignmentRequiredForRole(userRole: string, accountRole: string) {
  return userRole === "teacher" || accountRole === "admin";
}

router.get(
  "/workflow/resources/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole, accountRole } = req as AuthenticatedRequest;
    const resourceId = parseId(req.params.id);
    if (!resourceId) {
      res.status(400).json({ error: "Invalid resource" });
      return;
    }
    const [resource] = await db
      .select({ id: resourcesTable.id })
      .from(resourcesTable)
      .where(eq(resourcesTable.id, resourceId));
    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    await recordWorkflowEvent({
      userId,
      event: "resource_viewed",
      resourceId,
      oncePerDay: true,
    });

    const [events, savedRows] = await Promise.all([
      db
        .select({
          event: workflowEventsTable.event,
          activityId: workflowEventsTable.activityId,
          activityTitle: studyActivitiesTable.title,
          classId: workflowEventsTable.classId,
          className: classesTable.name,
          assignmentId: workflowEventsTable.assignmentId,
          assignmentTitle: classAssignmentsTable.title,
          createdAt: workflowEventsTable.createdAt,
        })
        .from(workflowEventsTable)
        .leftJoin(
          studyActivitiesTable,
          eq(studyActivitiesTable.id, workflowEventsTable.activityId),
        )
        .leftJoin(classesTable, eq(classesTable.id, workflowEventsTable.classId))
        .leftJoin(
          classAssignmentsTable,
          eq(classAssignmentsTable.id, workflowEventsTable.assignmentId),
        )
        .where(
          and(
            eq(workflowEventsTable.userId, userId),
            eq(workflowEventsTable.resourceId, resourceId),
          ),
        )
        .orderBy(desc(workflowEventsTable.createdAt)),
      db
        .select({ id: listItemsTable.id })
        .from(listItemsTable)
        .innerJoin(
          resourceListsTable,
          eq(resourceListsTable.id, listItemsTable.listId),
        )
        .where(
          and(
            eq(listItemsTable.resourceId, resourceId),
            eq(resourceListsTable.ownerId, userId),
          ),
        )
        .limit(1),
    ]);

    const reviewed = events.some((item) => item.event === "resource_reviewed");
    const saved = savedRows.length > 0 || events.some((item) => item.event === "resource_saved");
    const activity = events.find(
      (item) =>
        ["activity_created", "activity_remixed"].includes(item.event) &&
        item.activityId &&
        item.activityTitle,
    );
    const classShare = events.find(
      (item) => item.event === "class_shared" && item.classId,
    );
    const assignment = events.find(
      (item) =>
        item.event === "assignment_created" &&
        item.assignmentId &&
        item.assignmentTitle,
    );

    if (savedRows.length && !events.some((item) => item.event === "resource_saved")) {
      await recordWorkflowEvent({
        userId,
        event: "resource_saved",
        resourceId,
        context: { importedFromLibrary: true },
      });
    }

    const steps = {
      reviewed,
      saved,
      activityCreated: Boolean(activity),
      classShared: Boolean(classShare),
      assignmentCreated: Boolean(assignment),
    };
    const assignmentRequired = assignmentRequiredForRole(userRole, accountRole);
    const nextAction = nextResourceWorkflowAction(steps, assignmentRequired);

    res.json({
      resourceId,
      steps,
      nextAction,
      assignmentRequired,
      activity: activity
        ? { id: activity.activityId, title: activity.activityTitle }
        : null,
      classShare: classShare
        ? { id: classShare.classId, name: classShare.className }
        : null,
      assignment: assignment
        ? { id: assignment.assignmentId, title: assignment.assignmentTitle }
        : null,
    });
  },
);

// Remove a resource from the caller's "Continue workflow" list by deleting
// their workflow events for it. Only the current user's events are touched, so
// this cannot affect anyone else's dashboard.
router.delete(
  "/workflow/continue/:resourceId",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const resourceId = Number(req.params.resourceId);
    if (!Number.isInteger(resourceId) || resourceId <= 0) {
      res.status(400).json({ error: "Invalid resource id" });
      return;
    }
    await db
      .delete(workflowEventsTable)
      .where(
        and(
          eq(workflowEventsTable.userId, userId),
          eq(workflowEventsTable.resourceId, resourceId),
        ),
      );
    res.status(204).end();
  },
);

router.get(
  "/workflow/continue",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole, accountRole } = req as AuthenticatedRequest;
    const assignmentRequired = assignmentRequiredForRole(userRole, accountRole);
    const rows = await db
      .select({
        event: workflowEventsTable.event,
        resourceId: workflowEventsTable.resourceId,
        resourceTitle: resourcesTable.title,
        resourceSubject: resourcesTable.subject,
        resourceFormat: resourcesTable.format,
        activityId: workflowEventsTable.activityId,
        activityTitle: studyActivitiesTable.title,
        classId: workflowEventsTable.classId,
        className: classesTable.name,
        assignmentId: workflowEventsTable.assignmentId,
        assignmentTitle: classAssignmentsTable.title,
        createdAt: workflowEventsTable.createdAt,
      })
      .from(workflowEventsTable)
      .innerJoin(resourcesTable, eq(resourcesTable.id, workflowEventsTable.resourceId))
      .leftJoin(
        studyActivitiesTable,
        eq(studyActivitiesTable.id, workflowEventsTable.activityId),
      )
      .leftJoin(classesTable, eq(classesTable.id, workflowEventsTable.classId))
      .leftJoin(
        classAssignmentsTable,
        eq(classAssignmentsTable.id, workflowEventsTable.assignmentId),
      )
      .where(
        and(
          eq(workflowEventsTable.userId, userId),
          isNotNull(workflowEventsTable.resourceId),
        ),
      )
      .orderBy(desc(workflowEventsTable.createdAt))
      .limit(300);

    type Journey = {
      resourceId: number;
      resourceTitle: string;
      resourceSubject: string;
      resourceFormat: string;
      lastEventAt: string;
      events: Set<(typeof rows)[number]["event"]>;
      activity: { id: number; title: string } | null;
      classShare: { id: number; name: string | null } | null;
      assignment: { id: number; title: string } | null;
    };
    const journeys = new Map<number, Journey>();
    for (const row of rows) {
      if (!row.resourceId) continue;
      let journey = journeys.get(row.resourceId);
      if (!journey) {
        journey = {
          resourceId: row.resourceId,
          resourceTitle: row.resourceTitle,
          resourceSubject: row.resourceSubject,
          resourceFormat: row.resourceFormat,
          lastEventAt: row.createdAt,
          events: new Set(),
          activity: null,
          classShare: null,
          assignment: null,
        };
        journeys.set(row.resourceId, journey);
      }
      journey.events.add(row.event);
      if (
        !journey.activity &&
        ["activity_created", "activity_remixed"].includes(row.event) &&
        row.activityId &&
        row.activityTitle
      ) {
        journey.activity = { id: row.activityId, title: row.activityTitle };
      }
      if (
        !journey.classShare &&
        row.event === "class_shared" &&
        row.classId
      ) {
        journey.classShare = { id: row.classId, name: row.className };
      }
      if (
        !journey.assignment &&
        row.event === "assignment_created" &&
        row.assignmentId &&
        row.assignmentTitle
      ) {
        journey.assignment = {
          id: row.assignmentId,
          title: row.assignmentTitle,
        };
      }
    }

    const result = Array.from(journeys.values())
      .map((journey) => {
        const steps = {
          reviewed: journey.events.has("resource_reviewed"),
          saved: journey.events.has("resource_saved"),
          activityCreated:
            journey.events.has("activity_created") ||
            journey.events.has("activity_remixed"),
          classShared: journey.events.has("class_shared"),
          assignmentCreated: journey.events.has("assignment_created"),
        };
        const nextAction = nextResourceWorkflowAction(
          steps,
          assignmentRequired,
        );
        const completedSteps = [
          steps.reviewed,
          steps.saved,
          steps.activityCreated,
          steps.classShared,
          ...(assignmentRequired ? [steps.assignmentCreated] : []),
        ].filter(Boolean).length;
        return {
          resourceId: journey.resourceId,
          title: journey.resourceTitle,
          subject: journey.resourceSubject,
          format: journey.resourceFormat,
          lastEventAt: journey.lastEventAt,
          steps,
          nextAction,
          completedSteps,
          totalSteps: assignmentRequired ? 5 : 4,
          activity: journey.activity,
          classShare: journey.classShare,
          assignment: journey.assignment,
        };
      })
      // Only surface a resource once the user has taken a real workflow
      // action on it (verify/save/build/share/assign). Merely viewing a
      // resource logs an event but completes no step, so it should not appear
      // here as "unfinished work".
      .filter(
        (journey) =>
          journey.nextAction !== "complete" && journey.completedSteps > 0,
      )
      .slice(0, 6);

    res.json(result);
  },
);

async function assignmentRows(classId: number, userId: number) {
  const rows = await db
    .select({
      id: classAssignmentsTable.id,
      classId: classAssignmentsTable.classId,
      title: classAssignmentsTable.title,
      instructions: classAssignmentsTable.instructions,
      resourceId: classAssignmentsTable.resourceId,
      activityId: classAssignmentsTable.activityId,
      dueAt: classAssignmentsTable.dueAt,
      createdAt: classAssignmentsTable.createdAt,
      resourceTitle: resourcesTable.title,
      resourceUrl: resourcesTable.url,
      activityTitle: studyActivitiesTable.title,
      completedAt: assignmentCompletionsTable.completedAt,
    })
    .from(classAssignmentsTable)
    .leftJoin(
      resourcesTable,
      eq(resourcesTable.id, classAssignmentsTable.resourceId),
    )
    .leftJoin(
      studyActivitiesTable,
      eq(studyActivitiesTable.id, classAssignmentsTable.activityId),
    )
    .leftJoin(
      assignmentCompletionsTable,
      and(
        eq(assignmentCompletionsTable.assignmentId, classAssignmentsTable.id),
        eq(assignmentCompletionsTable.userId, userId),
      ),
    )
    .where(eq(classAssignmentsTable.classId, classId))
    .orderBy(
      asc(classAssignmentsTable.dueAt),
      asc(classAssignmentsTable.createdAt),
    );
  return rows.map((row) => ({ ...row, completed: Boolean(row.completedAt) }));
}

async function workflowResourceForActivity(activityId: number | null) {
  if (!activityId) return null;
  const [event] = await db
    .select({ resourceId: workflowEventsTable.resourceId })
    .from(workflowEventsTable)
    .where(eq(workflowEventsTable.activityId, activityId))
    .orderBy(desc(workflowEventsTable.createdAt))
    .limit(1);
  return event?.resourceId ?? null;
}

router.post(
  "/classes/join",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const code =
      typeof req.body?.code === "string"
        ? req.body.code.trim().toUpperCase()
        : "";
    if (!/^[A-F0-9]{8}$/.test(code)) {
      res.status(400).json({ error: "Enter a valid 8-character class code" });
      return;
    }
    const [cls] = await db
      .select()
      .from(classesTable)
      .where(eq(classesTable.joinCode, code));
    if (!cls) {
      res.status(404).json({ error: "Class code not found" });
      return;
    }
    // The roster limit belongs to the teacher who owns the class, so a free
    // student is never blocked from joining a class a paid teacher runs.
    if (!(await ensureClassMemberCapacity(res, cls.id))) return;
    await db
      .insert(classMembersTable)
      .values({ classId: cls.id, userId, role: "student" })
      .onConflictDoNothing();
    res.json({ id: cls.id, name: cls.name });
  },
);

router.post(
  "/classes/:id/join-code",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const classId = parseId(req.params.id);
    if (!classId || !(await isClassTeacher(classId, userId))) {
      res
        .status(403)
        .json({ error: "Only the class teacher can create a join code" });
      return;
    }
    let joinCode = createJoinCode();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const [existing] = await db
        .select({ id: classesTable.id })
        .from(classesTable)
        .where(eq(classesTable.joinCode, joinCode));
      if (!existing) break;
      joinCode = createJoinCode();
    }
    await db
      .update(classesTable)
      .set({ joinCode })
      .where(eq(classesTable.id, classId));
    res.json({ joinCode });
  },
);

router.get(
  "/classes/:id/join-code",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const classId = parseId(req.params.id);
    if (!classId || !(await isClassTeacher(classId, userId))) {
      res
        .status(403)
        .json({ error: "Only the class teacher can view the join code" });
      return;
    }
    const [cls] = await db
      .select({ joinCode: classesTable.joinCode })
      .from(classesTable)
      .where(eq(classesTable.id, classId));
    res.json({ joinCode: cls?.joinCode ?? null });
  },
);

router.get(
  "/classes/:id/assignments",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const classId = parseId(req.params.id);
    if (
      !classId ||
      (!(await isClassMember(classId, userId)) &&
        !(await isClassTeacher(classId, userId)))
    ) {
      res.status(403).json({ error: "Class access required" });
      return;
    }
    res.json(await assignmentRows(classId, userId));
  },
);

router.post(
  "/classes/:id/assignments",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const classId = parseId(req.params.id);
    if (!classId || !(await isClassTeacher(classId, userId))) {
      res.status(403).json({ error: "Only the class teacher can assign work" });
      return;
    }
    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const instructions =
      typeof req.body?.instructions === "string"
        ? req.body.instructions.trim().slice(0, 2000)
        : "";
    const resourceId = parseId(String(req.body?.resourceId ?? ""));
    const activityId = parseId(String(req.body?.activityId ?? ""));
    const dueAt =
      typeof req.body?.dueAt === "string" &&
      !Number.isNaN(Date.parse(req.body.dueAt))
        ? new Date(req.body.dueAt).toISOString()
        : null;
    if (title.length < 2 || title.length > 180 || (resourceId && activityId)) {
      res
        .status(400)
        .json({ error: "Add a title and choose at most one linked item" });
      return;
    }
    if (resourceId) {
      const [resource] = await db
        .select({ id: resourcesTable.id })
        .from(resourcesTable)
        .where(eq(resourcesTable.id, resourceId));
      if (!resource) {
        res.status(400).json({ error: "Resource not found" });
        return;
      }
    }
    if (activityId) {
      const [activity] = await db
        .select({ id: studyActivitiesTable.id })
        .from(studyActivitiesTable)
        .where(
          and(
            eq(studyActivitiesTable.id, activityId),
            eq(studyActivitiesTable.ownerId, userId),
          ),
        );
      if (!activity) {
        res.status(400).json({ error: "Activity not found" });
        return;
      }
    }
    const [created] = await db
      .insert(classAssignmentsTable)
      .values({
        classId,
        createdById: userId,
        title,
        instructions: instructions || null,
        resourceId,
        activityId,
        dueAt,
      })
      .returning();
    await recordWorkflowEvent({
      userId,
      event: "assignment_created",
      resourceId: resourceId ?? (await workflowResourceForActivity(activityId)),
      activityId,
      classId,
      assignmentId: created.id,
    });
    res.status(201).json(created);
  },
);

router.delete(
  "/classes/:classId/assignments/:assignmentId",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const classId = parseId(req.params.classId);
    const assignmentId = parseId(req.params.assignmentId);
    if (!classId || !assignmentId || !(await isClassTeacher(classId, userId))) {
      res
        .status(403)
        .json({ error: "Only the class teacher can delete assignments" });
      return;
    }
    const removed = await db
      .delete(classAssignmentsTable)
      .where(
        and(
          eq(classAssignmentsTable.id, assignmentId),
          eq(classAssignmentsTable.classId, classId),
        ),
      )
      .returning({ id: classAssignmentsTable.id });
    if (!removed.length) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.patch(
  "/assignments/:id/completion",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const assignmentId = parseId(req.params.id);
    const [assignment] = assignmentId
      ? await db
          .select()
          .from(classAssignmentsTable)
          .where(eq(classAssignmentsTable.id, assignmentId))
      : [];
    if (!assignment || !(await isClassMember(assignment.classId, userId))) {
      res.status(403).json({ error: "Assignment access required" });
      return;
    }
    const completed = req.body?.completed !== false;
    if (completed) {
      await db
        .insert(assignmentCompletionsTable)
        .values({ assignmentId: assignment.id, userId })
        .onConflictDoNothing();
      await recordWorkflowEvent({
        userId,
        event: "assignment_completed",
        resourceId:
          assignment.resourceId ??
          (await workflowResourceForActivity(assignment.activityId)),
        activityId: assignment.activityId,
        classId: assignment.classId,
        assignmentId: assignment.id,
      });
    } else {
      await db
        .delete(assignmentCompletionsTable)
        .where(
          and(
            eq(assignmentCompletionsTable.assignmentId, assignment.id),
            eq(assignmentCompletionsTable.userId, userId),
          ),
        );
    }
    res.json({ completed });
  },
);

router.get(
  "/assignments/today",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const memberships = await db
      .select({ classId: classMembersTable.classId })
      .from(classMembersTable)
      .where(eq(classMembersTable.userId, userId));
    if (!memberships.length) {
      res.json([]);
      return;
    }
    const classIds = memberships.map((row) => row.classId);
    const assignments = await db
      .select({
        id: classAssignmentsTable.id,
        classId: classAssignmentsTable.classId,
        className: classesTable.name,
        title: classAssignmentsTable.title,
        instructions: classAssignmentsTable.instructions,
        resourceId: classAssignmentsTable.resourceId,
        activityId: classAssignmentsTable.activityId,
        dueAt: classAssignmentsTable.dueAt,
        completedAt: assignmentCompletionsTable.completedAt,
      })
      .from(classAssignmentsTable)
      .innerJoin(
        classesTable,
        eq(classesTable.id, classAssignmentsTable.classId),
      )
      .leftJoin(
        assignmentCompletionsTable,
        and(
          eq(assignmentCompletionsTable.assignmentId, classAssignmentsTable.id),
          eq(assignmentCompletionsTable.userId, userId),
        ),
      )
      .where(inArray(classAssignmentsTable.classId, classIds))
      .orderBy(
        asc(classAssignmentsTable.dueAt),
        asc(classAssignmentsTable.createdAt),
      );
    res.json(
      assignments.map((row) => ({
        ...row,
        completed: Boolean(row.completedAt),
      })),
    );
  },
);

router.get(
  "/classes/:id/analytics",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const classId = parseId(req.params.id);
    if (!classId || !(await isClassTeacher(classId, userId))) {
      res
        .status(403)
        .json({ error: "Only the class teacher can view analytics" });
      return;
    }
    const [{ studentCount }] = await db
      .select({ studentCount: sql<number>`cast(count(*) as int)` })
      .from(classMembersTable)
      .where(
        and(
          eq(classMembersTable.classId, classId),
          eq(classMembersTable.role, "student"),
        ),
      );
    const assignments = await db
      .select({
        id: classAssignmentsTable.id,
        title: classAssignmentsTable.title,
        dueAt: classAssignmentsTable.dueAt,
        completions: sql<number>`cast(count(${assignmentCompletionsTable.userId}) as int)`,
      })
      .from(classAssignmentsTable)
      .leftJoin(
        assignmentCompletionsTable,
        eq(assignmentCompletionsTable.assignmentId, classAssignmentsTable.id),
      )
      .where(eq(classAssignmentsTable.classId, classId))
      .groupBy(classAssignmentsTable.id)
      .orderBy(asc(classAssignmentsTable.dueAt));
    res.json({
      studentCount,
      assignments: assignments.map((item) => ({
        ...item,
        completionRate: studentCount
          ? Math.round((item.completions / studentCount) * 100)
          : 0,
      })),
    });
  },
);

export default router;
