/**
 * @fileOverview API role: implements the Classes HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, sql, and, max, asc, desc } from "drizzle-orm";
import { db, classesTable, classMembersTable, classInvitationsTable, usersTable, resourceListsTable, listItemsTable, resourcesTable, reviewsTable, scheduleBlocksTable, activityLogTable, classResourceRecommendationsTable, studyActivitiesTable, canvasesTable } from "@workspace/db";
import { publicResourceColumns } from "../lib/resourceColumns";
import {
  ListClassesResponse,
  CreateClassBody,
  CreateClassResponse,
  GetClassParams,
  GetClassResponse,
  UpdateClassParams,
  UpdateClassBody,
  UpdateClassResponse,
  DeleteClassParams,
  ListClassMembersParams,
  ListClassMembersResponse,
RemoveClassMemberParams,
  BulkInviteClassMembersParams,
  BulkInviteClassMembersBody,
  BulkInviteClassMembersResponse,
  GetResourceListResponse,
  AssignResourceToClassBody,
  AssignResourceToClassResponse,
  ListResourceListsResponse,
  GetSeatingChartParams,
  GetSeatingChartResponse,
  UpdateSeatingChartParams,
  UpdateSeatingChartBody,
  UpdateSeatingChartResponse,
  UpdateStudentNoteParams,
  UpdateStudentNoteBody,
  UpdateStudentRoleParams,
  UpdateStudentRoleBody,
  UpdateStudentRoleResponse,
  SuggestSeatingPlanParams,
  SuggestSeatingPlanBody,
  SuggestSeatingPlanResponse,
  UpdateStudentNoteResponse,
  RecommendResourceToClassBody,
  ListClassResourceRecommendationsResponse,
  ReviewClassResourceRecommendationBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { isClassTeacher, isClassMember } from "../lib/authz";
import { getAccountEntitlements } from "../lib/entitlements";
import {
  ensureAccountCapacity,
  ensureClassMemberCapacity,
} from "../lib/planCapacity";
import {
  depthPreferenceScore,
  describeSeatDepth,
  parseSeatingNote,
  seatingPreferenceReasons,
} from "../lib/seatingRules";
import { validationMessage } from "../lib/validationMessage";
import { sendPushNotification } from "../lib/pushNotifications";

async function resourceWithRating(id: number) {
  const [r] = await db
    .select(publicResourceColumns)
    .from(resourcesTable)
    .where(eq(resourcesTable.id, id));
  if (!r) return null;
  const [stats] = await db
    .select({ avg: sql<number>`coalesce(avg(rating), 0)`, count: sql<number>`cast(count(*) as int)` })
    .from(reviewsTable)
    .where(eq(reviewsTable.resourceId, id));
  return { ...r, avgRating: Math.round(Number(stats.avg) * 10) / 10, reviewCount: stats.count };
}

/** Find or create the "Class Resources" list for a class. ownerId is used only when creating. */
async function getOrCreateClassList(classId: number, ownerId: number) {
  const [existing] = await db
    .select()
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.classId, classId), eq(resourceListsTable.name, "Class Resources")));
  if (existing) return existing;
  const [created] = await db
    .insert(resourceListsTable)
    .values({ name: "Class Resources", ownerId, classId, workspaceRole: "teacher" })
    .returning();
  return created;
}

/**
 * Body for inviting someone to a class: just their email.
 *
 * Defined here rather than imported from @workspace/api-zod because the schema
 * it used to borrow (AddClassMemberBody) belonged to POST /classes/:id/members,
 * the consent-free force-add route that was removed. The invitation routes are
 * not in lib/api-spec yet - the web app reaches them through a hand-rolled
 * fetch helper - so there is no generated schema to use, and validating the
 * body locally is better than leaving it unvalidated.
 */
const InviteClassMemberBody = z.object({
  email: z.email().max(320),
});

const router: IRouter = Router();

async function invitationView(id: number) {
  const [invitation] = await db
    .select()
    .from(classInvitationsTable)
    .where(eq(classInvitationsTable.id, id));
  if (!invitation) return null;
  const [[cls], [inviter], [invitee]] = await Promise.all([
    db
      .select({ id: classesTable.id, name: classesTable.name })
      .from(classesTable)
      .where(eq(classesTable.id, invitation.classId)),
    db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, invitation.invitedById)),
    db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, invitation.userId)),
  ]);
  return cls && inviter && invitee
    ? { ...invitation, class: cls, inviter, invitee }
    : null;
}

router.get("/class-invitations", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const rows = await db
    .select({ id: classInvitationsTable.id })
    .from(classInvitationsTable)
    .where(
      and(
        eq(classInvitationsTable.userId, userId),
        eq(classInvitationsTable.status, "pending"),
      ),
    )
    .orderBy(desc(classInvitationsTable.createdAt));
  const invitations = await Promise.all(rows.map((row) => invitationView(row.id)));
  res.json(invitations.filter(Boolean));
});

router.patch(
  "/class-invitations/:id",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const invitationId = Number(req.params.id);
    const action = req.body?.action;
    if (!Number.isInteger(invitationId) || !["accept", "decline"].includes(action)) {
      res.status(400).json({ error: "Choose whether to accept or decline the invitation" });
      return;
    }
    const [invitation] = await db
      .select()
      .from(classInvitationsTable)
      .where(
        and(
          eq(classInvitationsTable.id, invitationId),
          eq(classInvitationsTable.userId, userId),
          eq(classInvitationsTable.status, "pending"),
        ),
      );
    if (!invitation) {
      res.status(404).json({ error: "Pending invitation not found" });
      return;
    }
    const accepted = action === "accept";
    // Checked at accept time as well as at invite time: the roster can fill up,
    // or the teacher's plan can lapse, between sending an invitation and the
    // student answering it.
    if (
      accepted &&
      !(await ensureClassMemberCapacity(res, invitation.classId))
    ) {
      return;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(classInvitationsTable)
        .set({
          status: accepted ? "accepted" : "declined",
          respondedAt: new Date().toISOString(),
        })
        .where(eq(classInvitationsTable.id, invitation.id));
      if (accepted) {
        await tx
          .insert(classMembersTable)
          .values({
            classId: invitation.classId,
            userId,
            role: invitation.role,
          })
          .onConflictDoNothing();
      }
    });
    const [cls] = await db
      .select({ name: classesTable.name })
      .from(classesTable)
      .where(eq(classesTable.id, invitation.classId));
    await db.insert(activityLogTable).values({
      userId: invitation.invitedById,
      type: "class",
      workspaceRole: "teacher",
      message: `${accepted ? "Accepted" : "Declined"} class invitation: ${cls?.name ?? "Class"}.`,
    });
    res.json({ accepted, classId: invitation.classId });
  },
);

async function classWithCount(id: number) {
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, id));
  if (!cls) return null;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(classMembersTable)
    .where(eq(classMembersTable.classId, id));
  return { ...cls, memberCount: count };
}

// GET /classes, classes the current user belongs to or teaches
router.get("/classes", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const memberships = await db
    .select({ classId: classMembersTable.classId })
    .from(classMembersTable)
    .where(eq(classMembersTable.userId, userId));
  const memberClassIds = memberships.map((m) => m.classId);

  const owned = await db
    .select()
    .from(classesTable)
    .where(eq(classesTable.teacherId, userId));

  const allIds = new Set([...memberClassIds, ...owned.map((c) => c.id)]);
  const classes = await Promise.all([...allIds].map((id) => classWithCount(id)));
  res.json(ListClassesResponse.parse(classes.filter(Boolean)));
});

// POST /classes, teacher role required (verified against live DB, not token claim)
router.post("/classes", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const [currentUser] = await db
    .select({ role: usersTable.role, activeRole: usersTable.activeRole })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!currentUser || !["teacher", "admin"].includes(currentUser.role) || (currentUser.activeRole ?? currentUser.role) !== "teacher") {
    res.status(403).json({ error: "Only teachers can create classes" });
    return;
  }
  const parsed = CreateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  if (!(await ensureAccountCapacity(res, userId, "classes-owned"))) return;
  const [cls] = await db
    .insert(classesTable)
    .values({ ...parsed.data, teacherId: userId })
    .returning();
  await db
    .insert(classMembersTable)
    .values({ userId, classId: cls.id, role: "teacher" })
    .onConflictDoNothing();
  // Auto-create the shared "Class Resources" list for this class
  await db.insert(resourceListsTable).values({ name: "Class Resources", ownerId: userId, classId: cls.id, workspaceRole: "teacher" });
  res.status(201).json(CreateClassResponse.parse({ ...cls, memberCount: 1 }));
});

// GET /classes/:id, class members and teachers only
router.get("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isClassMember(params.data.id, userId)) && !(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Not a member of this class" });
    return;
  }
  const cls = await classWithCount(params.data.id);
  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  const membersRaw = await db
    .select()
    .from(classMembersTable)
    .where(eq(classMembersTable.classId, params.data.id));
  const members = await Promise.all(
    membersRaw.map(async (m) => {
      const [user] = await db
        .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, subjects: usersTable.subjects, gradeOrDept: usersTable.gradeOrDept })
        .from(usersTable)
        .where(eq(usersTable.id, m.userId));
      return { ...m, user };
    }),
  );

  const ownMembership = membersRaw.find((member) => member.userId === userId);
  let mySeat:
    | {
        assigned: boolean;
        layoutMode: "grid" | "custom";
        row: number | null;
        column: number | null;
        deskId: string | null;
        deskLabel: string | null;
        deskSeat: number | null;
        relativePosition: "front" | "middle" | "back" | null;
      }
    | undefined;

  if (ownMembership?.role === "student") {
    const desks = cls.seatingLayout ?? [];
    const layoutMode = desks.length > 0 ? "custom" : "grid";
    const desk =
      layoutMode === "custom"
        ? desks.find((item) => item.id === ownMembership.seatDeskId)
        : undefined;
    const assigned =
      layoutMode === "custom"
        ? desk != null && ownMembership.seatPosition != null
        : ownMembership.seatRow != null && ownMembership.seatColumn != null;
    const positionPercent = !assigned
      ? null
      : layoutMode === "custom"
        ? desk?.y ?? null
        : ((ownMembership.seatRow! + 0.5) /
            Math.max(cls.seatingRows, 1)) *
          100;
    const relativePosition =
      positionPercent == null
        ? null
        : positionPercent <= 33
          ? "front"
          : positionPercent >= 67
            ? "back"
            : "middle";

    mySeat = {
      assigned,
      layoutMode,
      row: ownMembership.seatRow,
      column: ownMembership.seatColumn,
      deskId: ownMembership.seatDeskId,
      deskLabel: desk?.label || null,
      deskSeat: ownMembership.seatPosition,
      relativePosition,
    };
  }

  res.json(GetClassResponse.parse({ ...cls, members, mySeat }));
});

// PATCH /classes/:id, class teacher only
router.patch("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can update this class" });
    return;
  }
  const parsed = UpdateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const [cls] = await db
    .update(classesTable)
    .set(parsed.data)
    .where(eq(classesTable.id, params.data.id))
    .returning();
  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  const withCount = await classWithCount(cls.id);
  res.json(UpdateClassResponse.parse(withCount));
});

// DELETE /classes/:id, class teacher only
router.delete("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can delete this class" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(scheduleBlocksTable).set({ classId: null }).where(eq(scheduleBlocksTable.classId, params.data.id));
    /**
     * Hand people's own work back rather than destroying it.
     *
     * study_activities.class_id and canvases.class_id are both ON DELETE
     * CASCADE, so deleting the class used to delete every activity and canvas
     * shared with it -- including ones a student made and shared. A pupil who
     * built a revision set for their class lost it when the teacher tidied up
     * at the end of term: their work, deleted by somebody else's action, with
     * no warning and no way back.
     *
     * Detaching first leaves the cascade nothing to take. The row returns to
     * its owner's own library, which is where it came from. A canvas also
     * stops being class-visible, because a canvas still marked "class" with no
     * class to belong to is readable by nobody and looks broken.
     *
     * Schedule blocks were already treated this way, one line above. The same
     * reasoning applies to anything a person owns.
     */
    await tx.update(studyActivitiesTable).set({ classId: null }).where(eq(studyActivitiesTable.classId, params.data.id));
    await tx.update(canvasesTable).set({ classId: null, visibility: "private" }).where(eq(canvasesTable.classId, params.data.id));
    const classLists = await tx.select({ id: resourceListsTable.id }).from(resourceListsTable).where(eq(resourceListsTable.classId, params.data.id));
    for (const list of classLists) await tx.delete(listItemsTable).where(eq(listItemsTable.listId, list.id));
    await tx.delete(resourceListsTable).where(eq(resourceListsTable.classId, params.data.id));
    await tx.delete(classMembersTable).where(eq(classMembersTable.classId, params.data.id));
    await tx.delete(classesTable).where(eq(classesTable.id, params.data.id));
  });
  res.sendStatus(204);
});

// GET /classes/:id/members, class members only
router.get("/classes/:id/members", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = ListClassMembersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isClassMember(params.data.id, userId))) {
    res.status(403).json({ error: "Not a member of this class" });
    return;
  }
  const membersRaw = await db
    .select()
    .from(classMembersTable)
    .where(eq(classMembersTable.classId, params.data.id));
  const members = await Promise.all(
    membersRaw.map(async (m) => {
      const [user] = await db
        .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, subjects: usersTable.subjects, gradeOrDept: usersTable.gradeOrDept })
        .from(usersTable)
        .where(eq(usersTable.id, m.userId));
      return { ...m, user };
    }),
  );
  res.json(ListClassMembersResponse.parse(members));
});

router.get("/classes/:id/invitations", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId) || !(await isClassTeacher(classId, userId))) {
    res.status(403).json({ error: "Only the class teacher can view invitations" });
    return;
  }
  const rows = await db
    .select({ id: classInvitationsTable.id })
    .from(classInvitationsTable)
    .where(
      and(
        eq(classInvitationsTable.classId, classId),
        eq(classInvitationsTable.status, "pending"),
      ),
    )
    .orderBy(desc(classInvitationsTable.createdAt));
  const invitations = await Promise.all(rows.map((row) => invitationView(row.id)));
  res.json(invitations.filter(Boolean));
});

router.post(
  "/classes/:id/invitations",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const classId = Number(req.params.id);
    if (!Number.isInteger(classId) || !(await isClassTeacher(classId, userId))) {
      res.status(403).json({ error: "Only the class teacher can invite members" });
      return;
    }
    const parsed = InviteClassMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const [invitee] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email));
    if (!invitee) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const [membership] = await db
      .select({ userId: classMembersTable.userId })
      .from(classMembersTable)
      .where(
        and(
          eq(classMembersTable.classId, classId),
          eq(classMembersTable.userId, invitee.id),
        ),
      );
    if (membership) {
      res.status(409).json({ error: "This user is already a class member" });
      return;
    }
    // Refuse here rather than letting the teacher send invitations that would
    // be rejected when the student accepts them.
    if (!(await ensureClassMemberCapacity(res, classId))) return;
    const role = invitee.role === "teacher" ? "teacher" : "student";
    const [invitation] = await db
      .insert(classInvitationsTable)
      .values({ classId, userId: invitee.id, invitedById: userId, role })
      .onConflictDoUpdate({
        target: [classInvitationsTable.classId, classInvitationsTable.userId],
        set: {
          invitedById: userId,
          role,
          status: "pending",
          respondedAt: null,
          createdAt: new Date().toISOString(),
        },
      })
      .returning();
    const [cls] = await db
      .select({ name: classesTable.name })
      .from(classesTable)
      .where(eq(classesTable.id, classId));
    await db.insert(activityLogTable).values({
      userId: invitee.id,
      type: "class",
      workspaceRole: role,
      /*
       * A record of what happened, not an instruction.
       *
       * This told the reader to accept or decline -- at least an improvement
       * on "from notifications", a screen the phone does not have -- but the
       * activity log is permanent. Once the invitation was accepted the row
       * stayed on the dashboard telling the person to do something they had
       * already done, with no way to clear it: a to-do that cannot be ticked
       * off. Seen on the phone's own dashboard, above a Classes count of 1.
       *
       * The invitation card on the Classes tab is where accepting lives, on
       * both apps, and it disappears when answered. This is the history.
       */
      message: `You were invited to join ${cls?.name ?? "a class"}.`,
    });
    void sendPushNotification(
      invitee.id,
      "classes",
      "Class invitation",
      `You were invited to join ${cls?.name ?? "a class"}.`,
      "/classes",
    ).catch(() => undefined);
    res.status(201).json(await invitationView(invitation.id));
  },
);

// POST /classes/:id/members was REMOVED, and is deliberately not replaced.
//
// It looked up any account by email and inserted a class membership directly,
// with no consent from that person. Combined with PATCH /users/me/role, which
// lets any account act as a teacher, that meant a stranger could create a
// class and pull arbitrary users into it. Membership is not cosmetic: the
// default profileVisibility and libraryVisibility are "classmates", so being
// added to someone's class exposes profile and library contents to them, and
// sharesClass() is a bare class_members lookup that grants that access.
//
// POST /classes/:id/invitations below takes the same body and the same
// teacher check, but creates a PENDING invitation the invitee must accept, so
// nothing is lost by removing this. Nothing called it: there was no reference
// in the web app or the mobile app, only a generated hook nobody imported.
// The operation is gone from lib/api-spec/openapi.yaml too, so the generated
// clients no longer advertise a route that does not exist.

// POST /classes/:id/members/bulk-invite, class teacher only
// Adds multiple students by email. Students with matching EduHub accounts are
// auto-enrolled; emails with no account are reported as not_found.
router.post("/classes/:id/members/bulk-invite", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const params = BulkInviteClassMembersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can add members" });
    return;
  }

  const parsed = BulkInviteClassMembersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }

  const { emails } = parsed.data;

  // Fetch all matching users in one query.
  const { inArray } = await import("drizzle-orm");
  const matchedUsers = await db
    .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(inArray(usersTable.email, emails));

  const emailToUser = new Map(matchedUsers.map((u) => [u.email, u]));

  // Fetch existing memberships for this class to detect duplicates.
  const existingMembers = await db
    .select({ userId: classMembersTable.userId })
    .from(classMembersTable)
    .where(eq(classMembersTable.classId, params.data.id));
  const existingUserIds = new Set(existingMembers.map((m) => m.userId));

  const results: Array<{ email: string; status: "added" | "already_member" | "not_found" }> = [];
  const toInsert: Array<{ userId: number; classId: number; role: "student" | "teacher" }> = [];

  for (const email of emails) {
    const user = emailToUser.get(email);
    if (!user) {
      results.push({ email, status: "not_found" });
    } else if (existingUserIds.has(user.id)) {
      results.push({ email, status: "already_member" });
    } else {
      const memberRole = user.role === "admin" ? "student" : user.role as "student" | "teacher";
      toInsert.push({ userId: user.id, classId: params.data.id, role: memberRole });
      results.push({ email, status: "added" });
    }
  }

  if (toInsert.length > 0) {
    // A bulk invite is all-or-nothing against the roster limit. Accepting the
    // first N of a pasted list and silently dropping the rest would leave the
    // teacher believing the whole class was invited.
    if (
      !(await ensureClassMemberCapacity(res, params.data.id, toInsert.length))
    ) {
      return;
    }
    const [cls] = await db
      .select({ name: classesTable.name })
      .from(classesTable)
      .where(eq(classesTable.id, params.data.id));
    await db.transaction(async (tx) => {
      for (const member of toInsert) {
        await tx
          .insert(classInvitationsTable)
          .values({
            classId: member.classId,
            userId: member.userId,
            invitedById: userId,
            role: member.role,
          })
          .onConflictDoUpdate({
            target: [classInvitationsTable.classId, classInvitationsTable.userId],
            set: {
              invitedById: userId,
              role: member.role,
              status: "pending",
              respondedAt: null,
              createdAt: new Date().toISOString(),
            },
          });
      }
      await tx.insert(activityLogTable).values(
        toInsert.map((member) => ({
          userId: member.userId,
          type: "class" as const,
          workspaceRole: member.role,
          // A record, not an instruction; see the single-invite route above.
          message: `You were invited to join ${cls?.name ?? "a class"}.`,
        })),
      );
    });
  }

  const added = results.filter((r) => r.status === "added").length;
  const alreadyMember = results.filter((r) => r.status === "already_member").length;
  const notFound = results.filter((r) => r.status === "not_found").length;

  res.json(BulkInviteClassMembersResponse.parse({ added, alreadyMember, notFound, results }));
});

// DELETE /classes/:id/members/:userId, class teacher only
// Cannot remove the class creator (teacherId on the class).
router.delete("/classes/:id/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const { userId: requesterId } = req as AuthenticatedRequest;
  const params = RemoveClassMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isClassTeacher(params.data.id, requesterId))) {
    res.status(403).json({ error: "Only the class teacher can remove members" });
    return;
  }
  // Prevent removal of the class owner
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (cls && cls.teacherId === params.data.userId) {
    res.status(400).json({ error: "Cannot remove the class owner" });
    return;
  }
  const [removedMembership] = await db.select({ role: classMembersTable.role }).from(classMembersTable).where(and(eq(classMembersTable.userId, params.data.userId), eq(classMembersTable.classId, params.data.id)));
  await db
    .delete(classMembersTable)
    .where(
      and(
        eq(classMembersTable.userId, params.data.userId),
        eq(classMembersTable.classId, params.data.id),
      ),
    );
  if (removedMembership) await db.insert(activityLogTable).values({ userId: params.data.userId, type: "class", workspaceRole: removedMembership.role, message: "You were removed from " + (cls?.name ?? "a class") + "." });
  res.sendStatus(204);
});

async function seatingChart(classId: number) {
  const [cls] = await db.select({ rows: classesTable.seatingRows, columns: classesTable.seatingColumns, desks: classesTable.seatingLayout }).from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) return null;
  const students = await db.select({
    userId: classMembersTable.userId, name: usersTable.name, avatarUrl: usersTable.avatarUrl,
    gradeOrDept: usersTable.gradeOrDept, teacherNote: classMembersTable.teacherNote,
    customRole: classMembersTable.customRole,
    seatRow: classMembersTable.seatRow, seatColumn: classMembersTable.seatColumn,
    seatDeskId: classMembersTable.seatDeskId, seatPosition: classMembersTable.seatPosition,
  }).from(classMembersTable).innerJoin(usersTable, eq(usersTable.id, classMembersTable.userId))
    .where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.role, "student"))).orderBy(asc(usersTable.name));
  return { classId, rows: cls.rows, columns: cls.columns, layoutMode: cls.desks?.length ? "custom" as const : "grid" as const, desks: cls.desks ?? [], students };
}

router.get("/classes/:id/seating-chart", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetSeatingChartParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: validationMessage(params.error) }); return; }
  const teacher = await isClassTeacher(params.data.id, userId);
  if (!teacher && !(await isClassMember(params.data.id, userId))) {
    res.status(403).json({ error: "Only class members can view the seating chart" });
    return;
  }
  const chart = await seatingChart(params.data.id);
  if (!chart) { res.status(404).json({ error: "Class not found" }); return; }
  const visibleChart = teacher
    ? chart
    : {
        ...chart,
        students: chart.students.map((student) => ({ ...student, teacherNote: null })),
      };
  res.json(GetSeatingChartResponse.parse(visibleChart));
});

router.post("/classes/:id/seating-suggestions", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetSeatingChartParams.safeParse(req.params);
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!params.success || message.length < 3 || message.length > 1000) {
    res.status(400).json({ error: "Please enter a suggestion between 3 and 1000 characters" });
    return;
  }

  const [membership] = await db
    .select({ role: classMembersTable.role })
    .from(classMembersTable)
    .where(and(eq(classMembersTable.classId, params.data.id), eq(classMembersTable.userId, userId)));
  if (membership?.role !== "student") {
    res.status(403).json({ error: "Only students in this class can submit seating suggestions" });
    return;
  }

  const [cls] = await db
    .select({ name: classesTable.name, teacherId: classesTable.teacherId })
    .from(classesTable)
    .where(eq(classesTable.id, params.data.id));
  const [student] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!cls || !student) {
    res.status(404).json({ error: "Class or student not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    userId: cls.teacherId,
    type: "class",
    workspaceRole: "teacher",
    message: `${student.name} suggested a seating change in ${cls.name}: ${message}`,
  });
  res.status(201).json({ success: true });
});

router.put("/classes/:id/seating-chart", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateSeatingChartParams.safeParse(req.params);
  const body = UpdateSeatingChartBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid seating chart" }); return; }
  if (!(await isClassTeacher(params.data.id, userId))) { res.status(403).json({ error: "Only the class teacher can edit seating" }); return; }
  const occupied = new Set<string>();
  const deskById = new Map(body.data.desks.map((desk) => [desk.id, desk]));
  if (body.data.layoutMode === "custom" && body.data.desks.length === 0) { res.status(400).json({ error: "Custom classrooms need at least one desk" }); return; }
  if (new Set(body.data.desks.map((desk) => desk.id)).size !== body.data.desks.length) { res.status(400).json({ error: "Desk IDs must be unique" }); return; }
  const memberRows = await db.select({ userId: classMembersTable.userId }).from(classMembersTable)
    .where(and(eq(classMembersTable.classId, params.data.id), eq(classMembersTable.role, "student")));
  const studentIds = new Set(memberRows.map((member) => member.userId));
  for (const assignment of body.data.assignments) {
    if (!studentIds.has(assignment.userId)) { res.status(400).json({ error: "Every assignment must reference a student in this class" }); return; }
    if (body.data.layoutMode === "custom") {
      if (assignment.deskId == null || assignment.deskSeat == null) continue;
      const desk = deskById.get(assignment.deskId);
      if (!desk || assignment.deskSeat < 0 || assignment.deskSeat >= desk.capacity) { res.status(400).json({ error: "Seat is outside its desk capacity" }); return; }
      // Must identify the actual desk and seat. This was `desk::` - a template
      // literal with no interpolations, so every assignment produced the same
      // constant string and the second seated student always collided with the
      // first. Custom layouts could hold exactly one student; the grid branch
      // below was unaffected because it builds a real key.
      const deskKey = `desk:${assignment.deskId}:${assignment.deskSeat}`;
      if (occupied.has(deskKey)) { res.status(400).json({ error: "Two students cannot share one desk position" }); return; }
      occupied.add(deskKey);
      continue;
    }
    if (assignment.row == null || assignment.column == null) continue;
    if (assignment.row < 0 || assignment.column < 0 || assignment.row >= body.data.rows || assignment.column >= body.data.columns) { res.status(400).json({ error: "Seat is outside the classroom grid" }); return; }
    const key = `${assignment.row}:${assignment.column}`;
    if (occupied.has(key)) { res.status(400).json({ error: "Two students cannot share one seat" }); return; }
    occupied.add(key);
  }
  await db.transaction(async (tx) => {
    await tx.update(classesTable).set({ seatingRows: body.data.rows, seatingColumns: body.data.columns, seatingLayout: body.data.layoutMode === "custom" ? body.data.desks : null }).where(eq(classesTable.id, params.data.id));
    await tx.update(classMembersTable).set({ seatRow: null, seatColumn: null, seatDeskId: null, seatPosition: null }).where(and(eq(classMembersTable.classId, params.data.id), eq(classMembersTable.role, "student")));
    for (const assignment of body.data.assignments) {
      await tx.update(classMembersTable).set({ seatRow: assignment.row, seatColumn: assignment.column, seatDeskId: assignment.deskId, seatPosition: assignment.deskSeat })
        .where(and(eq(classMembersTable.classId, params.data.id), eq(classMembersTable.userId, assignment.userId), eq(classMembersTable.role, "student")));
    }
  });
  res.json(UpdateSeatingChartResponse.parse(await seatingChart(params.data.id)));
});

router.post("/classes/:id/seating-plan/suggest", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = SuggestSeatingPlanParams.safeParse(req.params);
  const body = SuggestSeatingPlanBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid seating-plan request" }); return; }
  if (!(await isClassTeacher(params.data.id, userId))) { res.status(403).json({ error: "Only the class teacher can request a seating plan" }); return; }
  const isAdmin = (req as AuthenticatedRequest).accountRole === "admin";
  const entitlements = await getAccountEntitlements(userId);
  if (!isAdmin && !entitlements.features["seating-planner"]) {
    // This route already required the class teacher, so the plan that fits
    // is the teacher ladder's Pro step (generic Pro also carries the feature
    // and keeps working for accounts that hold it). The planner below is
    // deterministic — pattern rules over notes and positions, no model call —
    // so the refusal must not call it AI, and no AI allowance is consumed.
    res.status(402).json({
      error: "The explainable seating planner requires Casparel Pro.",
      code: "SUBSCRIPTION_REQUIRED",
      requiredPlan: "pro",
    });
    return;
  }
  const chart = await seatingChart(params.data.id);
  if (!chart) { res.status(404).json({ error: "Class not found" }); return; }

  const custom = chart.layoutMode === "custom" && chart.desks.length > 0;
  const availableSeats = custom
    ? [...chart.desks].sort((a, b) => a.y - b.y || a.x - b.x).flatMap((desk) => Array.from({ length: desk.capacity }, (_, deskSeat) => ({ row: null, column: null, deskId: desk.id, deskSeat, front: desk.y, label: desk.label || "Desk" })))
    : Array.from({ length: chart.rows * chart.columns }, (_, index) => { const row = Math.floor(index / chart.columns), column = index % chart.columns; return { row, column, deskId: null, deskSeat: null, front: chart.rows <= 1 ? 0 : row / (chart.rows - 1) * 100, label: `Row ${row + 1}` }; });
  if (chart.students.length > availableSeats.length) { res.status(400).json({ error: "The classroom needs more seats before a plan can be suggested" }); return; }

  const separatePattern = /talks? (a lot|too much)|distract|separate|apart|away from|conflict|avoid|not (sit|seat)/i;
  const togetherPattern = /works? well|support|partner|collaborat|help|sit with|seat with/i;
  const normalized = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const studentById = new Map(chart.students.map((student) => [student.userId, student]));
  const noteSignals = new Map(
    chart.students.map((student) => [
      student.userId,
      parseSeatingNote(student.teacherNote),
    ]),
  );
  const seatFronts = availableSeats.map((seat) => seat.front);
  const minimumFront = Math.min(...seatFronts);
  const maximumFront = Math.max(...seatFronts);
  const avoid = new Map<number, Set<number>>(), prefer = new Map<number, Set<number>>();
  for (const student of chart.students) {
    const note = normalized(student.teacherNote ?? "");
    for (const other of chart.students) {
      if (student.userId === other.userId) continue;
      const fullName = normalized(other.name), firstName = fullName.split(/\s+/)[0];
      if (!note.includes(fullName) && (firstName.length < 3 || !note.includes(firstName))) continue;
      const target = separatePattern.test(note) ? avoid : togetherPattern.test(note) ? prefer : null;
      if (target) {
        if (!target.has(student.userId)) target.set(student.userId, new Set());
        target.get(student.userId)!.add(other.userId);
        if (target === avoid) { if (!avoid.has(other.userId)) avoid.set(other.userId, new Set()); avoid.get(other.userId)!.add(student.userId); }
      }
    }
  }

  const ranked = [...chart.students].sort((a, b) => {
    const score = (userId: number) => {
      const signals = noteSignals.get(userId)!;
      return signals.wantsFront ? 0 : signals.wantsBack ? 2 : 1;
    };
    return score(a.userId) - score(b.userId) || a.name.localeCompare(b.name);
  });
  const remaining = [...availableSeats];
  const placed: Array<{ userId: number; row: number | null; column: number | null; deskId: string | null; deskSeat: number | null; front: number; label: string }> = [];
  for (const student of ranked) {
    const note = student.teacherNote ?? "";
    const signals = noteSignals.get(student.userId)!;
    let bestIndex = 0, bestScore = Number.POSITIVE_INFINITY;
    remaining.forEach((seat, index) => {
      const deskMates = seat.deskId == null ? [] : placed.filter((item) => item.deskId === seat.deskId).map((item) => item.userId);
      let score = depthPreferenceScore(
        seat.front,
        minimumFront,
        maximumFront,
        signals,
      );
      if (deskMates.some((id) => avoid.get(student.userId)?.has(id))) score += 10000;
      if (deskMates.some((id) => prefer.get(student.userId)?.has(id))) score -= 500;
      if (separatePattern.test(note) && deskMates.length) score += 250;
      if (signals.wantsQuiet && deskMates.length) score += 250;
      score += deskMates.length * 4;
      if (score < bestScore) { bestScore = score; bestIndex = index; }
    });
    const [seat] = remaining.splice(bestIndex, 1);
    placed.push({ userId: student.userId, ...seat });
  }

  const assignments = placed.map((placement) => {
    const student = studentById.get(placement.userId)!;
    const mates = placement.deskId == null ? [] : placed.filter((item) => item.deskId === placement.deskId && item.userId !== placement.userId).map((item) => studentById.get(item.userId)?.name).filter(Boolean);
    const oldDesk = student.seatDeskId ? chart.desks.find((desk) => desk.id === student.seatDeskId) : null;
    const signals = noteSignals.get(student.userId)!;
    const position = describeSeatDepth(
      placement.front,
      minimumFront,
      maximumFront,
    );
    const reasons = [`Placed ${position}${custom ? ` at ${placement.label}` : ""}.`];
    reasons.push(...seatingPreferenceReasons(signals));
    const avoidedNames = [...(avoid.get(student.userId) ?? [])].map((id) => studentById.get(id)?.name).filter(Boolean);
    if (avoidedNames.length) reasons.push(`Kept apart from ${avoidedNames.join(", ")} because the current private note indicates a distraction or separation concern.`);
    if (mates.length) reasons.push(`Desk-mates: ${mates.join(", ")}.`); else if (custom) reasons.push("No desk-mate is assigned at this desk.");
    if (oldDesk) reasons.push(`Previous position was ${oldDesk.label || "a desk"} at ${Math.round(oldDesk.y)}% from the front.`);
    return { userId: placement.userId, row: placement.row, column: placement.column, deskId: placement.deskId, deskSeat: placement.deskSeat, reason: reasons.join(" ") };
  });
  const noted = chart.students.filter((student) => student.teacherNote?.trim()).length;
  const relationships = [...avoid.values()].reduce((sum, ids) => sum + ids.size, 0) / 2;
  const considerations = [
    `Read private notes for ${noted} of ${chart.students.length} students.`,
    "Evaluated desk-mates and relative distance from the front.",
    ...(relationships > 0
      ? [`Applied ${Math.ceil(relationships)} named separation relationship(s).`]
      : []),
    "The plan is a suggestion only and has not changed the saved classroom.",
  ];
  if (body.data.priorities?.trim()) considerations.unshift(`Teacher priority: ${body.data.priorities.trim()}`);
  res.json(SuggestSeatingPlanResponse.parse({ rows: chart.rows, columns: chart.columns, layoutMode: chart.layoutMode, desks: chart.desks, summary: `Suggested a reviewable ${custom ? "custom classroom" : `${chart.rows} by ${chart.columns} grid`} plan for ${chart.students.length} students.`, considerations, assignments }));
});

router.put("/classes/:id/students/:userId/note", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId: teacherId } = req as AuthenticatedRequest;
  const params = UpdateStudentNoteParams.safeParse(req.params);
  const body = UpdateStudentNoteBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid note" }); return; }
  if (!(await isClassTeacher(params.data.id, teacherId))) { res.status(403).json({ error: "Only the class teacher can edit private notes" }); return; }
  const [updated] = await db.update(classMembersTable).set({ teacherNote: body.data.note?.trim() || null }).where(and(
    eq(classMembersTable.classId, params.data.id), eq(classMembersTable.userId, params.data.userId), eq(classMembersTable.role, "student"),
  )).returning();
  if (!updated) { res.status(404).json({ error: "Student not found in class" }); return; }
  const [student] = await db.select({ userId: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl, gradeOrDept: usersTable.gradeOrDept })
    .from(usersTable).where(eq(usersTable.id, params.data.userId));
  res.json(UpdateStudentNoteResponse.parse({ ...student, teacherNote: updated.teacherNote, seatRow: updated.seatRow, seatColumn: updated.seatColumn }));
});

// PUT /classes/:id/students/:userId/role — assign, edit or remove a custom
// class role ("Group Leader", "Note Taker"). Teacher-only to write, but unlike
// the private teacher note the label is visible to the whole class, which is
// why it lives in a separate column and a separate route.
router.put("/classes/:id/students/:userId/role", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId: teacherId } = req as AuthenticatedRequest;
  const params = UpdateStudentRoleParams.safeParse(req.params);
  const body = UpdateStudentRoleBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid role" }); return; }
  if (!(await isClassTeacher(params.data.id, teacherId))) { res.status(403).json({ error: "Only the class teacher can manage roles" }); return; }
  const [updated] = await db.update(classMembersTable).set({ customRole: body.data.role?.trim() || null }).where(and(
    eq(classMembersTable.classId, params.data.id), eq(classMembersTable.userId, params.data.userId), eq(classMembersTable.role, "student"),
  )).returning();
  if (!updated) { res.status(404).json({ error: "Student not found in class" }); return; }
  const [student] = await db.select({ userId: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl, gradeOrDept: usersTable.gradeOrDept })
    .from(usersTable).where(eq(usersTable.id, params.data.userId));
  res.json(UpdateStudentRoleResponse.parse({ ...student, customRole: updated.customRole, seatRow: updated.seatRow, seatColumn: updated.seatColumn }));
});

// GET /classes/:id/resources-list, any class member can view
router.get("/classes/:id/resources-list", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: validationMessage(params.error) }); return; }

  if (!(await isClassMember(params.data.id, userId)) && !(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Not a member of this class" }); return;
  }

  const [list] = await db
    .select()
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.classId, params.data.id), eq(resourceListsTable.name, "Class Resources")));

  if (!list) {
    // Class list not created yet, return empty shell
    res.json(GetResourceListResponse.parse({ id: 0, name: "Class Resources", description: null, ownerId: 0, classId: params.data.id, itemCount: 0, createdAt: new Date().toISOString(), items: [] }));
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(listItemsTable)
    .where(eq(listItemsTable.listId, list.id));

  const itemRows = await db
    .select()
    .from(listItemsTable)
    .where(eq(listItemsTable.listId, list.id))
    .orderBy(asc(listItemsTable.position), asc(listItemsTable.addedAt));

  const items = (await Promise.all(
    itemRows.map(async (item) => {
      const resource = await resourceWithRating(item.resourceId);
      return resource ? { ...item, resource } : null;
    })
  )).filter(Boolean);

  res.json(GetResourceListResponse.parse({ ...list, itemCount: count, items }));
});

// POST /classes/:id/assign, teacher only; adds resource to the class list
router.post("/classes/:id/assign", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: validationMessage(params.error) }); return; }

  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can assign resources" }); return;
  }

  const parsed = AssignResourceToClassBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: validationMessage(parsed.error) }); return; }

  // Validate resource exists before inserting (avoid FK 500)
  const [resource] = await db.select({ id: resourcesTable.id, title: resourcesTable.title }).from(resourcesTable)
    .where(eq(resourcesTable.id, parsed.data.resourceId));
  if (!resource) { res.status(404).json({ error: "Resource not found" }); return; }

  const list = await getOrCreateClassList(params.data.id, userId);

  // Skip duplicate
  const [already] = await db
    .select()
    .from(listItemsTable)
    .where(and(eq(listItemsTable.listId, list.id), eq(listItemsTable.resourceId, parsed.data.resourceId)));

  if (!already) {
    const [{ maxPos }] = await db
      .select({ maxPos: max(listItemsTable.position) })
      .from(listItemsTable)
      .where(eq(listItemsTable.listId, list.id));
    await db.insert(listItemsTable).values({ listId: list.id, resourceId: parsed.data.resourceId, position: (maxPos ?? -1) + 1 });
  }

  if (!already) {
    const students = await db.select({ userId: classMembersTable.userId }).from(classMembersTable).where(and(eq(classMembersTable.classId, params.data.id), eq(classMembersTable.role, "student")));
    if (students.length) await db.insert(activityLogTable).values(students.map((student) => ({ userId: student.userId, type: "class" as const, workspaceRole: "student" as const, message: "A new class resource was added: “" + resource.title + "”." })));
  }

  res.json(AssignResourceToClassResponse.parse({ listId: list.id }));
});

// DELETE /classes/:id/resources-list/items/:resourceId, teacher removes item from class list
router.delete("/classes/:id/resources-list/items/:resourceId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  const resourceId = Number(req.params.resourceId);
  if (!classId || !resourceId) { res.status(400).json({ error: "Invalid params" }); return; }

  if (!(await isClassTeacher(classId, userId))) {
    res.status(403).json({ error: "Only the class teacher can remove resources" }); return;
  }

  const [list] = await db
    .select()
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.classId, classId), eq(resourceListsTable.name, "Class Resources")));

  if (list) {
    await db
      .delete(listItemsTable)
      .where(and(eq(listItemsTable.listId, list.id), eq(listItemsTable.resourceId, resourceId)));
  }

  res.sendStatus(204);
});

// GET /classes/:id/shared-lists, other lists shared with this class (not "Class Resources")
// DELETE /classes/:id/leave, any member may leave. Transfer ownership first.
router.delete("/classes/:id/leave", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  if (!classId || !(await isClassMember(classId, userId))) {
    res.status(403).json({ error: "Not a member of this class" }); return;
  }
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
  let handOverTo: number | null = null;
  if (cls.teacherId === userId) {
    const [nextTeacher] = await db.select({ userId: classMembersTable.userId })
      .from(classMembersTable)
      .where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.role, "teacher")))
      .orderBy(asc(classMembersTable.joinedAt));
    const successor = nextTeacher?.userId === userId
      ? (await db.select({ userId: classMembersTable.userId }).from(classMembersTable)
          .where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.role, "teacher")))
          .orderBy(asc(classMembersTable.joinedAt))).find((member) => member.userId !== userId)
      : nextTeacher;
    if (!successor) {
      res.status(409).json({ error: "Add another teacher before leaving this class" }); return;
    }
    handOverTo = successor.userId;
  }
  /*
   * Handing the class over and leaving it are one act.
   *
   * These ran as separate statements, so a failure between them left the class
   * belonging to a teacher who had not agreed to it while the one who was
   * leaving was still on the roster -- or the reverse, a class whose owner had
   * walked out of it. Neither is a state anybody can see or repair from the
   * app.
   */
  await db.transaction(async (tx) => {
    if (handOverTo !== null) {
      await tx.update(classesTable).set({ teacherId: handOverTo }).where(eq(classesTable.id, classId));
    }
    await tx.delete(classMembersTable).where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.userId, userId)));
    if (cls.teacherId !== userId) {
      await tx.insert(activityLogTable).values({ userId: cls.teacherId, type: "class", workspaceRole: "teacher", message: "A student left " + cls.name + "." });
    }
  });
  res.sendStatus(204);
});

async function recommendationView(id: number) {
  const [row] = await db.select().from(classResourceRecommendationsTable).where(eq(classResourceRecommendationsTable.id, id));
  if (!row) return null;
  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.recommendedById));
  const resource = await resourceWithRating(row.resourceId);
  return resource && user ? { ...row, recommenderName: user.name, resource } : null;
}

router.get("/classes/:id/resource-recommendations", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  if (!classId || (!(await isClassMember(classId, userId)) && !(await isClassTeacher(classId, userId)))) {
    res.status(403).json({ error: "Not a member of this class" }); return;
  }
  const teacher = await isClassTeacher(classId, userId);
  const rows = await db.select({ id: classResourceRecommendationsTable.id })
    .from(classResourceRecommendationsTable)
    .where(teacher ? eq(classResourceRecommendationsTable.classId, classId) : and(eq(classResourceRecommendationsTable.classId, classId), eq(classResourceRecommendationsTable.recommendedById, userId)))
    .orderBy(desc(classResourceRecommendationsTable.createdAt));
  const items = (await Promise.all(rows.map((row) => recommendationView(row.id)))).filter(Boolean);
  res.json(ListClassResourceRecommendationsResponse.parse(items));
});

router.post("/classes/:id/resource-recommendations", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  const parsed = RecommendResourceToClassBody.safeParse(req.body);
  if (!classId || !parsed.success) { res.status(400).json({ error: "Invalid recommendation" }); return; }
  const [[membership], [currentUser]] = await Promise.all([
    db.select().from(classMembersTable).where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.userId, userId))),
    db.select({ role: usersTable.role, activeRole: usersTable.activeRole }).from(usersTable).where(eq(usersTable.id, userId)),
  ]);
  if (!membership) { res.status(403).json({ error: "Join this class before recommending resources" }); return; }
  if (!currentUser || (currentUser.activeRole ?? currentUser.role) !== "student") { res.status(403).json({ error: "Switch to student mode to recommend resources" }); return; }
  const [resource] = await db.select().from(resourcesTable).where(eq(resourcesTable.id, parsed.data.resourceId));
  if (!resource) { res.status(404).json({ error: "Resource not found" }); return; }
  const [existing] = await db.select().from(classResourceRecommendationsTable).where(and(
    eq(classResourceRecommendationsTable.classId, classId), eq(classResourceRecommendationsTable.resourceId, resource.id),
    eq(classResourceRecommendationsTable.recommendedById, userId), eq(classResourceRecommendationsTable.status, "pending"),
  ));
  /*
   * One pending recommendation per person per resource, and the index says so
   * -- but this read it and then inserted when it found none, so two taps on
   * "recommend" ran both halves at once, both found nothing, and the loser came
   * back 500.
   *
   * On a conflict the insert returns nothing, so the row the other tap made
   * has to be read back: handing `undefined` to `recommendation.id` below
   * would only trade the 500 for a different one.
   */
  const pendingForThisResource = and(
    eq(classResourceRecommendationsTable.classId, classId),
    eq(classResourceRecommendationsTable.resourceId, resource.id),
    eq(classResourceRecommendationsTable.recommendedById, userId),
    eq(classResourceRecommendationsTable.status, "pending"),
  );
  let recommendation = existing;
  if (!recommendation) {
    const [inserted] = await db
      .insert(classResourceRecommendationsTable)
      .values({ classId, resourceId: resource.id, recommendedById: userId, note: parsed.data.note?.trim() || null })
      .onConflictDoNothing()
      .returning();
    recommendation =
      inserted ??
      (await db.select().from(classResourceRecommendationsTable).where(pendingForThisResource))[0];
  }
  if (!recommendation) { res.status(500).json({ error: "Could not record the recommendation" }); return; }
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  if (!existing && cls && student) await db.insert(activityLogTable).values({ userId: cls.teacherId, type: "class", workspaceRole: "teacher", message: `${student.name} recommended "${resource.title}" for ${cls.name}.` });
  res.status(201).json(ListClassResourceRecommendationsResponse.element.parse(await recommendationView(recommendation.id)));
});

router.patch("/classes/:id/resource-recommendations/:recommendationId", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  const recommendationId = Number(req.params.recommendationId);
  const parsed = ReviewClassResourceRecommendationBody.safeParse(req.body);
  if (!classId || !recommendationId || !parsed.success) { res.status(400).json({ error: "Invalid review" }); return; }
  if (!(await isClassTeacher(classId, userId))) { res.status(403).json({ error: "Only the class teacher can review recommendations" }); return; }
  const [pending] = await db.select().from(classResourceRecommendationsTable).where(and(eq(classResourceRecommendationsTable.id, recommendationId), eq(classResourceRecommendationsTable.classId, classId), eq(classResourceRecommendationsTable.status, "pending")));
  if (!pending) { res.status(404).json({ error: "Pending recommendation not found" }); return; }
  await db.transaction(async (tx) => {
    if (parsed.data.status === "approved") {
      const list = await getOrCreateClassList(classId, userId);
      const [already] = await tx.select().from(listItemsTable).where(and(eq(listItemsTable.listId, list.id), eq(listItemsTable.resourceId, pending.resourceId)));
      if (!already) {
        const [{ maxPos }] = await tx.select({ maxPos: max(listItemsTable.position) }).from(listItemsTable).where(eq(listItemsTable.listId, list.id));
        await tx.insert(listItemsTable).values({ listId: list.id, resourceId: pending.resourceId, position: (maxPos ?? -1) + 1 });
      }
    }
    await tx.update(classResourceRecommendationsTable).set({ status: parsed.data.status, reviewedById: userId, reviewedAt: new Date().toISOString() }).where(eq(classResourceRecommendationsTable.id, recommendationId));
    const [resource] = await tx.select({ title: resourcesTable.title }).from(resourcesTable).where(eq(resourcesTable.id, pending.resourceId));
    await tx.insert(activityLogTable).values({ userId: pending.recommendedById, type: "class", workspaceRole: "student", message: `Your recommendation “${resource?.title ?? "Resource"}” was ${parsed.data.status}.` });
  });
  res.json(ListClassResourceRecommendationsResponse.element.parse(await recommendationView(recommendationId)));
});

router.get("/classes/:id/shared-lists", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  if (!classId) { res.status(400).json({ error: "Invalid classId" }); return; }

  if (!(await isClassMember(classId, userId)) && !(await isClassTeacher(classId, userId))) {
    res.status(403).json({ error: "Not a member of this class" }); return;
  }

  const rows = await db
    .select()
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.classId, classId)));

  const lists = await Promise.all(
    rows.map(async (l) => {
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(listItemsTable)
        .where(eq(listItemsTable.listId, l.id));
      return { ...l, itemCount: count };
    })
  );
  res.json(ListResourceListsResponse.parse(lists));
});

export default router;
