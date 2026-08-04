import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, classesTable, classMembersTable, usersTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { isClassTeacher, isClassMember } from "../lib/authz";

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
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
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
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
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

export default router;
