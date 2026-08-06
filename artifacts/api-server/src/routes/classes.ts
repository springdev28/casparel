import { Router, type IRouter } from "express";
import { eq, sql, and, max, asc, desc } from "drizzle-orm";
import { db, classesTable, classMembersTable, usersTable, resourceListsTable, listItemsTable, resourcesTable, reviewsTable, scheduleBlocksTable, activityLogTable, classResourceRecommendationsTable } from "@workspace/db";
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
  AddClassMemberParams,
  AddClassMemberBody,
  AddClassMemberResponse,
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

async function resourceWithRating(id: number) {
  const [r] = await db.select().from(resourcesTable).where(eq(resourcesTable.id, id));
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

const router: IRouter = Router();

async function classWithCount(id: number) {
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, id));
  if (!cls) return null;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(classMembersTable)
    .where(eq(classMembersTable.classId, id));
  return { ...cls, memberCount: count };
}

// GET /classes — classes the current user belongs to or teaches
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

// POST /classes — teacher role required (verified against live DB, not token claim)
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
    res.status(400).json({ error: parsed.error.message });
    return;
  }
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

// GET /classes/:id — class members and teachers only
router.get("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

// PATCH /classes/:id — class teacher only
router.patch("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can update this class" });
    return;
  }
  const parsed = UpdateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

// DELETE /classes/:id — class teacher only
router.delete("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can delete this class" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(scheduleBlocksTable).set({ classId: null }).where(eq(scheduleBlocksTable.classId, params.data.id));
    const classLists = await tx.select({ id: resourceListsTable.id }).from(resourceListsTable).where(eq(resourceListsTable.classId, params.data.id));
    for (const list of classLists) await tx.delete(listItemsTable).where(eq(listItemsTable.listId, list.id));
    await tx.delete(resourceListsTable).where(eq(resourceListsTable.classId, params.data.id));
    await tx.delete(classMembersTable).where(eq(classMembersTable.classId, params.data.id));
    await tx.delete(classesTable).where(eq(classesTable.id, params.data.id));
  });
  res.sendStatus(204);
});

// GET /classes/:id/members — class members only
router.get("/classes/:id/members", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = ListClassMembersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

// POST /classes/:id/members — class teacher only
// The membership role always mirrors the target user's account role to avoid contradictions.
router.post("/classes/:id/members", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = AddClassMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can add members" });
    return;
  }
  const parsed = AddClassMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Use the user's account role as their membership role — prevents assigning
  // "teacher" role in the class to a student account (or vice versa).
  const membershipRole = user.role === "admin" ? "student" : user.role;
  await db
    .insert(classMembersTable)
    .values({ userId: user.id, classId: params.data.id, role: membershipRole })
    .onConflictDoNothing();
  const [member] = await db
    .select()
    .from(classMembersTable)
    .where(
      and(
        eq(classMembersTable.userId, user.id),
        eq(classMembersTable.classId, params.data.id),
      ),
    );
  await db.insert(activityLogTable).values({ userId: user.id, type: "class", workspaceRole: membershipRole, message: "You were added to a class." });
  res.status(201).json(AddClassMemberResponse.parse({ ...member, user }));
});

// POST /classes/:id/members/bulk-invite — class teacher only
// Adds multiple students by email. Students with matching EduHub accounts are
// auto-enrolled; emails with no account are reported as not_found.
router.post("/classes/:id/members/bulk-invite", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const params = BulkInviteClassMembersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can add members" });
    return;
  }

  const parsed = BulkInviteClassMembersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
    await db.insert(classMembersTable).values(toInsert).onConflictDoNothing();
    await db.insert(activityLogTable).values(toInsert.map((member) => ({ userId: member.userId, type: "class" as const, workspaceRole: member.role, message: "You were added to a class." })));
  }

  const added = results.filter((r) => r.status === "added").length;
  const alreadyMember = results.filter((r) => r.status === "already_member").length;
  const notFound = results.filter((r) => r.status === "not_found").length;

  res.json(BulkInviteClassMembersResponse.parse({ added, alreadyMember, notFound, results }));
});

// DELETE /classes/:id/members/:userId — class teacher only
// Cannot remove the class creator (teacherId on the class).
router.delete("/classes/:id/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const { userId: requesterId } = req as AuthenticatedRequest;
  const params = RemoveClassMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
    seatRow: classMembersTable.seatRow, seatColumn: classMembersTable.seatColumn,
    seatDeskId: classMembersTable.seatDeskId, seatPosition: classMembersTable.seatPosition,
  }).from(classMembersTable).innerJoin(usersTable, eq(usersTable.id, classMembersTable.userId))
    .where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.role, "student"))).orderBy(asc(usersTable.name));
  return { classId, rows: cls.rows, columns: cls.columns, layoutMode: cls.desks?.length ? "custom" as const : "grid" as const, desks: cls.desks ?? [], students };
}

router.get("/classes/:id/seating-chart", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetSeatingChartParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
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
      if (!desk || assignment.deskSeat >= desk.capacity) { res.status(400).json({ error: "Seat is outside its desk capacity" }); return; }
      const deskKey = `desk::`;
      if (occupied.has(deskKey)) { res.status(400).json({ error: "Two students cannot share one desk position" }); return; }
      occupied.add(deskKey);
      continue;
    }
    if (assignment.row == null || assignment.column == null) continue;
    if (assignment.row >= body.data.rows || assignment.column >= body.data.columns) { res.status(400).json({ error: "Seat is outside the classroom grid" }); return; }
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
  const chart = await seatingChart(params.data.id);
  if (!chart) { res.status(404).json({ error: "Class not found" }); return; }

  const custom = chart.layoutMode === "custom" && chart.desks.length > 0;
  const availableSeats = custom
    ? [...chart.desks].sort((a, b) => a.y - b.y || a.x - b.x).flatMap((desk) => Array.from({ length: desk.capacity }, (_, deskSeat) => ({ row: null, column: null, deskId: desk.id, deskSeat, front: desk.y, label: desk.label || "Desk" })))
    : Array.from({ length: chart.rows * chart.columns }, (_, index) => { const row = Math.floor(index / chart.columns), column = index % chart.columns; return { row, column, deskId: null, deskSeat: null, front: chart.rows <= 1 ? 0 : row / (chart.rows - 1) * 100, label: `Row ${row + 1}` }; });
  if (chart.students.length > availableSeats.length) { res.status(400).json({ error: "The classroom needs more seats before a plan can be suggested" }); return; }

  const frontPattern = /front|board|vision|hearing|attention|focus|near (the )?teacher/i;
  const backPattern = /back|independent|self-directed|quiet work/i;
  const separatePattern = /talks? (a lot|too much)|distract|separate|apart|away from|conflict|avoid|not (sit|seat)/i;
  const togetherPattern = /works? well|support|partner|collaborat|help|sit with|seat with/i;
  const normalized = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const studentById = new Map(chart.students.map((student) => [student.userId, student]));
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
    const score = (note: string | null | undefined) => frontPattern.test(note ?? "") ? 0 : backPattern.test(note ?? "") ? 2 : 1;
    return score(a.teacherNote) - score(b.teacherNote) || a.name.localeCompare(b.name);
  });
  const remaining = [...availableSeats];
  const placed: Array<{ userId: number; row: number | null; column: number | null; deskId: string | null; deskSeat: number | null; front: number; label: string }> = [];
  for (const student of ranked) {
    const note = student.teacherNote ?? "";
    let bestIndex = 0, bestScore = Number.POSITIVE_INFINITY;
    remaining.forEach((seat, index) => {
      const deskMates = seat.deskId == null ? [] : placed.filter((item) => item.deskId === seat.deskId).map((item) => item.userId);
      let score = frontPattern.test(note) ? seat.front * 4 : backPattern.test(note) ? (100 - seat.front) * 3 : Math.abs(seat.front - 48);
      if (deskMates.some((id) => avoid.get(student.userId)?.has(id))) score += 10000;
      if (deskMates.some((id) => prefer.get(student.userId)?.has(id))) score -= 500;
      if (separatePattern.test(note) && deskMates.length) score += 250;
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
    const position = placement.front <= 30 ? "near the front" : placement.front >= 70 ? "toward the back" : "in the middle area";
    const reasons = [`Placed ${position}${custom ? ` at ${placement.label}` : ""}.`];
    if (frontPattern.test(student.teacherNote ?? "")) reasons.push("The private note indicates closer teacher or board access may help.");
    if (backPattern.test(student.teacherNote ?? "")) reasons.push("The private note indicates independent or quiet work may suit this student.");
    const avoidedNames = [...(avoid.get(student.userId) ?? [])].map((id) => studentById.get(id)?.name).filter(Boolean);
    if (avoidedNames.length) reasons.push(`Kept apart from ${avoidedNames.join(", ")} because the current private note indicates a distraction or separation concern.`);
    if (mates.length) reasons.push(`Desk-mates: ${mates.join(", ")}.`); else if (custom) reasons.push("No desk-mate is assigned at this desk.");
    if (oldDesk) reasons.push(`Previous position was ${oldDesk.label || "a desk"} at ${Math.round(oldDesk.y)}% from the front.`);
    return { userId: placement.userId, row: placement.row, column: placement.column, deskId: placement.deskId, deskSeat: placement.deskSeat, reason: reasons.join(" ") };
  });
  const noted = chart.students.filter((student) => student.teacherNote?.trim()).length;
  const relationships = [...avoid.values()].reduce((sum, ids) => sum + ids.size, 0) / 2;
  const considerations = [`Used private notes for ${noted} of ${chart.students.length} students.`, `Evaluated ${Math.ceil(relationships)} named separation relationship(s), desk-mates, and distance from the front.`, "The plan is a suggestion only and has not changed the saved classroom."];
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

// GET /classes/:id/resources-list — any class member can view
router.get("/classes/:id/resources-list", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  if (!(await isClassMember(params.data.id, userId)) && !(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Not a member of this class" }); return;
  }

  const [list] = await db
    .select()
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.classId, params.data.id), eq(resourceListsTable.name, "Class Resources")));

  if (!list) {
    // Class list not created yet — return empty shell
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

// POST /classes/:id/assign — teacher only; adds resource to the class list
router.post("/classes/:id/assign", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  if (!(await isClassTeacher(params.data.id, userId))) {
    res.status(403).json({ error: "Only the class teacher can assign resources" }); return;
  }

  const parsed = AssignResourceToClassBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

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

// DELETE /classes/:id/resources-list/items/:resourceId — teacher removes item from class list
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

// GET /classes/:id/shared-lists — other lists shared with this class (not "Class Resources")
// DELETE /classes/:id/leave — any member may leave. Transfer ownership first.
router.delete("/classes/:id/leave", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const classId = Number(req.params.id);
  if (!classId || !(await isClassMember(classId, userId))) {
    res.status(403).json({ error: "Not a member of this class" }); return;
  }
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
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
    await db.update(classesTable).set({ teacherId: successor.userId }).where(eq(classesTable.id, classId));
  }
  await db.delete(classMembersTable).where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.userId, userId)));
  if (cls.teacherId !== userId) await db.insert(activityLogTable).values({ userId: cls.teacherId, type: "class", workspaceRole: "teacher", message: "A student left " + cls.name + "." });
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
  const recommendation = existing ?? (await db.insert(classResourceRecommendationsTable).values({ classId, resourceId: resource.id, recommendedById: userId, note: parsed.data.note?.trim() || null }).returning())[0];
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
