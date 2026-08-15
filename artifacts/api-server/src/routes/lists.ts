import { Router, type IRouter } from "express";
import { eq, sql, and, max, asc, inArray, or } from "drizzle-orm";
import { db, resourceListsTable, listItemsTable, resourcesTable, reviewsTable, classMembersTable } from "@workspace/db";
import { publicResourceColumns } from "../lib/resourceColumns";
import {
  ListResourceListsResponse,
  CreateResourceListBody,
  CreateResourceListResponse,
  GetResourceListParams,
  GetResourceListResponse,
  UpdateResourceListParams,
  UpdateResourceListBody,
  UpdateResourceListResponse,
  DeleteResourceListParams,
  AddListItemParams,
  AddListItemBody,
  AddListItemResponse,
  RemoveListItemParams,
  ReorderListItemsParams,
  ReorderListItemsBody,
  ShareListWithClassParams,
  ShareListWithClassBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { isListOwner, canReadList, isListItemOwner, isClassTeacher } from "../lib/authz";
import { recordWorkflowEvent } from "../lib/workflowAnalytics";
import { ensureAccountCapacity } from "../lib/planCapacity";

const router: IRouter = Router();

async function resourceWithRating(id: number) {
  const [r] = await db
    .select(publicResourceColumns)
    .from(resourcesTable)
    .where(eq(resourcesTable.id, id));
  if (!r) return null;
  const [stats] = await db
    .select({
      avg: sql<number>`coalesce(avg(rating), 0)`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.resourceId, id));
  return { ...r, avgRating: Math.round(Number(stats.avg) * 10) / 10, reviewCount: stats.count };
}

async function listWithCount(id: number) {
  const [list] = await db.select().from(resourceListsTable).where(eq(resourceListsTable.id, id));
  if (!list) return null;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(listItemsTable)
    .where(eq(listItemsTable.listId, id));
  return { ...list, itemCount: count };
}

// GET /lists/shared, lists shared with classes the user is a member of
router.get("/lists/shared", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const memberships = await db
    .select({ classId: classMembersTable.classId })
    .from(classMembersTable)
    .where(eq(classMembersTable.userId, userId));
  if (memberships.length === 0) { res.json([]); return; }
  const classIds = memberships.map((m) => m.classId);
  const rows = await db
    .select()
    .from(resourceListsTable)
    .where(inArray(resourceListsTable.classId, classIds));
  const lists = await Promise.all(rows.map((l) => listWithCount(l.id)));
  res.json(ListResourceListsResponse.parse(lists.filter(Boolean)));
});

// GET /lists, only the current user's own lists
router.get("/lists", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const rows = await db
    .select()
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.ownerId, userId), or(eq(resourceListsTable.workspaceRole, userRole as "student" | "teacher"), eq(resourceListsTable.workspaceRole, "shared"))!));
  const lists = await Promise.all(rows.map((l) => listWithCount(l.id)));
  res.json(ListResourceListsResponse.parse(lists.filter(Boolean)));
});

// POST /lists, any authenticated user
router.post("/lists", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const parsed = CreateResourceListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await ensureAccountCapacity(res, userId, "resource-lists"))) return;
  const [list] = await db
    .insert(resourceListsTable)
    .values({ ...parsed.data, ownerId: userId, workspaceRole: userRole as "student" | "teacher" })
    .returning();
  res.status(201).json(CreateResourceListResponse.parse({ ...list, itemCount: 0 }));
});

// GET /lists/:id, owner or member of the shared class
router.get("/lists/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = GetResourceListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await canReadList(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "You do not have access to this list" });
    return;
  }
  const list = await listWithCount(params.data.id);
  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }
  const itemRows = await db
    .select()
    .from(listItemsTable)
    .where(eq(listItemsTable.listId, params.data.id))
    .orderBy(asc(listItemsTable.position), asc(listItemsTable.addedAt));
  const items = await Promise.all(
    itemRows.map(async (item) => {
      const resource = await resourceWithRating(item.resourceId);
      return { ...item, resource };
    }),
  );
  res.json(GetResourceListResponse.parse({ ...list, items }));
});

// PATCH /lists/:id, owner only
router.patch("/lists/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = UpdateResourceListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can update this list" });
    return;
  }
  const parsed = UpdateResourceListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [list] = await db
    .update(resourceListsTable)
    .set(parsed.data)
    .where(eq(resourceListsTable.id, params.data.id))
    .returning();
  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }
  const withCount = await listWithCount(list.id);
  res.json(UpdateResourceListResponse.parse(withCount));
});

// DELETE /lists/:id, owner only
router.delete("/lists/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = DeleteResourceListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Check existence before the ownership guard so that a second concurrent
  // DELETE (racing after the first already removed the row) returns 204
  // instead of 403 (isListOwner returns false for a non-existent list).
  const [existing] = await db
    .select({ id: resourceListsTable.id })
    .from(resourceListsTable)
    .where(eq(resourceListsTable.id, params.data.id));
  if (!existing) {
    res.sendStatus(204);
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can delete this list" });
    return;
  }
  await db.delete(listItemsTable).where(eq(listItemsTable.listId, params.data.id));
  await db.delete(resourceListsTable).where(eq(resourceListsTable.id, params.data.id));
  res.sendStatus(204);
});

// POST /lists/:id/items, owner only
router.post("/lists/:id/items", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = AddListItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can add items" });
    return;
  }
  const parsed = AddListItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [maxResult] = await db
    .select({ maxPos: max(listItemsTable.position) })
    .from(listItemsTable)
    .where(eq(listItemsTable.listId, params.data.id));
  const nextPosition = (maxResult?.maxPos ?? -1) + 1;
  const [item] = await db
    .insert(listItemsTable)
    .values({ listId: params.data.id, position: nextPosition, ...parsed.data })
    .returning();
  await recordWorkflowEvent({
    userId,
    event: "resource_saved",
    resourceId: item.resourceId,
    context: { listId: params.data.id },
  });
  const resource = await resourceWithRating(item.resourceId);
  res.status(201).json(AddListItemResponse.parse({ ...item, resource }));
});

// POST /lists/:id/items/reorder, list owner only
// Must be registered before DELETE /lists/:id/items/:itemId so Express doesn't
// mistake "reorder" for an itemId.
router.post("/lists/:id/items/reorder", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = ReorderListItemsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can reorder items" });
    return;
  }
  const parsed = ReorderListItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Validate: submitted IDs must exactly match the current items in this list
  const existing = await db
    .select({ id: listItemsTable.id })
    .from(listItemsTable)
    .where(eq(listItemsTable.listId, params.data.id));
  const existingIds = new Set(existing.map((r) => r.id));
  const submittedIds = parsed.data.itemIds;
  const submittedSet = new Set(submittedIds);

  if (
    submittedIds.length !== existingIds.size ||
    submittedIds.some((id) => !existingIds.has(id)) ||
    submittedIds.length !== submittedSet.size // no duplicates
  ) {
    res.status(400).json({ error: "itemIds must be an exact, duplicate-free permutation of the list's current items" });
    return;
  }

  // Persist positions
  await Promise.all(
    submittedIds.map((itemId: number, index: number) =>
      db
        .update(listItemsTable)
        .set({ position: index })
        .where(and(eq(listItemsTable.id, itemId), eq(listItemsTable.listId, params.data.id))),
    ),
  );
  res.sendStatus(204);
});

// DELETE /lists/:id/items/:itemId, list owner only
router.delete("/lists/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = RemoveListItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListItemOwner(params.data.itemId, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can remove items" });
    return;
  }
  await db
    .delete(listItemsTable)
    .where(and(eq(listItemsTable.id, params.data.itemId), eq(listItemsTable.listId, params.data.id)));
  res.sendStatus(204);
});

// POST /lists/:id/share, list owner + class teacher
router.post("/lists/:id/share", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = ShareListWithClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can share this list" });
    return;
  }
  const parsed = ShareListWithClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await isClassTeacher(parsed.data.classId, userId))) {
    res.status(403).json({ error: "You must be the teacher of the target class to share a list with it" });
    return;
  }
  await db
    .update(resourceListsTable)
    .set({ classId: parsed.data.classId })
    .where(eq(resourceListsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
