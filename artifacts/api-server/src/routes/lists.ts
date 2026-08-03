import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, resourceListsTable, listItemsTable, resourcesTable, reviewsTable } from "@workspace/db";
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
  ShareListWithClassParams,
  ShareListWithClassBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { isListOwner, canReadList, isListItemOwner, isClassTeacher } from "../lib/authz";

const router: IRouter = Router();

async function resourceWithRating(id: number) {
  const [r] = await db.select().from(resourcesTable).where(eq(resourcesTable.id, id));
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

// GET /lists — only the current user's own lists
router.get("/lists", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const rows = await db
    .select()
    .from(resourceListsTable)
    .where(eq(resourceListsTable.ownerId, userId));
  const lists = await Promise.all(rows.map((l) => listWithCount(l.id)));
  res.json(ListResourceListsResponse.parse(lists.filter(Boolean)));
});

// POST /lists — any authenticated user
router.post("/lists", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = CreateResourceListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [list] = await db
    .insert(resourceListsTable)
    .values({ ...parsed.data, ownerId: userId })
    .returning();
  res.status(201).json(CreateResourceListResponse.parse({ ...list, itemCount: 0 }));
});

// GET /lists/:id — owner or member of the shared class
router.get("/lists/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetResourceListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await canReadList(params.data.id, userId))) {
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
    .where(eq(listItemsTable.listId, params.data.id));
  const items = await Promise.all(
    itemRows.map(async (item) => {
      const resource = await resourceWithRating(item.resourceId);
      return { ...item, resource };
    }),
  );
  res.json(GetResourceListResponse.parse({ ...list, items }));
});

// PATCH /lists/:id — owner only
router.patch("/lists/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateResourceListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListOwner(params.data.id, userId))) {
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

// DELETE /lists/:id — owner only
router.delete("/lists/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteResourceListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListOwner(params.data.id, userId))) {
    res.status(403).json({ error: "Only the list owner can delete this list" });
    return;
  }
  await db.delete(listItemsTable).where(eq(listItemsTable.listId, params.data.id));
  await db.delete(resourceListsTable).where(eq(resourceListsTable.id, params.data.id));
  res.sendStatus(204);
});

// POST /lists/:id/items — owner only
router.post("/lists/:id/items", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = AddListItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListOwner(params.data.id, userId))) {
    res.status(403).json({ error: "Only the list owner can add items" });
    return;
  }
  const parsed = AddListItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db
    .insert(listItemsTable)
    .values({ listId: params.data.id, ...parsed.data })
    .returning();
  const resource = await resourceWithRating(item.resourceId);
  res.status(201).json(AddListItemResponse.parse({ ...item, resource }));
});

// DELETE /lists/:id/items/:itemId — list owner only
router.delete("/lists/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = RemoveListItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListItemOwner(params.data.itemId, userId))) {
    res.status(403).json({ error: "Only the list owner can remove items" });
    return;
  }
  await db
    .delete(listItemsTable)
    .where(and(eq(listItemsTable.id, params.data.itemId), eq(listItemsTable.listId, params.data.id)));
  res.sendStatus(204);
});

// POST /lists/:id/share — list owner + class teacher
router.post("/lists/:id/share", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = ShareListWithClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isListOwner(params.data.id, userId))) {
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
