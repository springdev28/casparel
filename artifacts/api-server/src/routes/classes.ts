import { Router, type IRouter } from "express";
import { eq, sql, and, max, asc } from "drizzle-orm";
import { db, classesTable, classMembersTable, usersTable, resourceListsTable, listItemsTable, resourcesTable, reviewsTable } from "@workspace/db";
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
  UpdateStudentNoteResponse,
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
    .values({ name: "Class Resources", ownerId, classId })
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
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!currentUser || currentUser.role !== "teacher") {
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
  await db.insert(resourceListsTable).values({ name: "Class Resources", ownerId: userId, classId: cls.id });
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
  res.json(GetClassResponse.parse({ ...cls, members }));
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
  await db.delete(classMembersTable).where(eq(classMembersTable.classId, params.data.id));
  await db.delete(classesTable).where(eq(classesTable.id, params.data.id));
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
  const membershipRole = user.role;
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
      toInsert.push({ userId: user.id, classId: params.data.id, role: user.role as "student" | "teacher" });
      results.push({ email, status: "added" });
    }
  }

  if (toInsert.length > 0) {
    await db.insert(classMembersTable).values(toInsert).onConflictDoNothing();
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
  await db
    .delete(classMembersTable)
    .where(
      and(
        eq(classMembersTable.userId, params.data.userId),
        eq(classMembersTable.classId, params.data.id),
      ),
    );
  res.sendStatus(204);
});

async function seatingChart(classId: number) {
  const [cls] = await db.select({ rows: classesTable.seatingRows, columns: classesTable.seatingColumns }).from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) return null;
  const students = await db.select({
    userId: classMembersTable.userId, name: usersTable.name, avatarUrl: usersTable.avatarUrl,
    gradeOrDept: usersTable.gradeOrDept, teacherNote: classMembersTable.teacherNote,
    seatRow: classMembersTable.seatRow, seatColumn: classMembersTable.seatColumn,
  }).from(classMembersTable).innerJoin(usersTable, eq(usersTable.id, classMembersTable.userId))
    .where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.role, "student"))).orderBy(asc(usersTable.name));
  return { classId, rows: cls.rows, columns: cls.columns, students };
}

router.get("/classes/:id/seating-chart", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetSeatingChartParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!(await isClassTeacher(params.data.id, userId))) { res.status(403).json({ error: "Only the class teacher can view private seating notes" }); return; }
  const chart = await seatingChart(params.data.id);
  if (!chart) { res.status(404).json({ error: "Class not found" }); return; }
  res.json(GetSeatingChartResponse.parse(chart));
});

router.put("/classes/:id/seating-chart", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateSeatingChartParams.safeParse(req.params);
  const body = UpdateSeatingChartBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid seating chart" }); return; }
  if (!(await isClassTeacher(params.data.id, userId))) { res.status(403).json({ error: "Only the class teacher can edit seating" }); return; }
  const occupied = new Set<string>();
  const memberRows = await db.select({ userId: classMembersTable.userId }).from(classMembersTable)
    .where(and(eq(classMembersTable.classId, params.data.id), eq(classMembersTable.role, "student")));
  const studentIds = new Set(memberRows.map((member) => member.userId));
  for (const assignment of body.data.assignments) {
    if (!studentIds.has(assignment.userId)) { res.status(400).json({ error: "Every assignment must reference a student in this class" }); return; }
    if (assignment.row == null || assignment.column == null) continue;
    if (assignment.row >= body.data.rows || assignment.column >= body.data.columns) { res.status(400).json({ error: "Seat is outside the classroom grid" }); return; }
    const key = `:`;
    if (occupied.has(key)) { res.status(400).json({ error: "Two students cannot share one seat" }); return; }
    occupied.add(key);
  }
  await db.transaction(async (tx) => {
    await tx.update(classesTable).set({ seatingRows: body.data.rows, seatingColumns: body.data.columns }).where(eq(classesTable.id, params.data.id));
    await tx.update(classMembersTable).set({ seatRow: null, seatColumn: null }).where(and(eq(classMembersTable.classId, params.data.id), eq(classMembersTable.role, "student")));
    for (const assignment of body.data.assignments) {
      await tx.update(classMembersTable).set({ seatRow: assignment.row, seatColumn: assignment.column })
        .where(and(eq(classMembersTable.classId, params.data.id), eq(classMembersTable.userId, assignment.userId), eq(classMembersTable.role, "student")));
    }
  });
  res.json(UpdateSeatingChartResponse.parse(await seatingChart(params.data.id)));
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
  const [resource] = await db.select({ id: resourcesTable.id }).from(resourcesTable)
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
