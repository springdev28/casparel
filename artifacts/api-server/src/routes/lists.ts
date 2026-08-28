/**
 * @fileOverview API role: implements the Lists HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import { eq, sql, and, max, asc, inArray, or } from "drizzle-orm";
import { db, resourceListsTable, listItemsTable, classMembersTable } from "@workspace/db";
import {
  resourceWithRating,
  resourcesWithRatings,
} from "../lib/resourceRatings";
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
import { validationMessage } from "../lib/validationMessage";

const router: IRouter = Router();

async function listWithCount(id: number) {
  const [list] = await db.select().from(resourceListsTable).where(eq(resourceListsTable.id, id));
  if (!list) return null;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(listItemsTable)
    .where(eq(listItemsTable.listId, id));
  return { ...list, itemCount: count };
}

/**
 * Rows the caller already has, with how many resources are in each.
 *
 * One grouped query for all of them. The listing routes ran
 * `Promise.all(rows.map(listWithCount))`, which re-selected each list row the
 * caller was already holding and then counted its items: two round trips per
 * list, so a teacher with fifteen lists paid thirty-one. Round trips are what
 * these endpoints cost, and the pool is ten connections wide, so the fan-out
 * queued behind itself as well.
 */
async function withItemCounts<T extends { id: number }>(rows: T[]) {
  if (rows.length === 0) return [];
  const counts = await db
    .select({
      listId: listItemsTable.listId,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(listItemsTable)
    .where(inArray(listItemsTable.listId, rows.map((row) => row.id)))
    .groupBy(listItemsTable.listId);
  const byList = new Map(counts.map((row) => [row.listId, row.count]));
  // A list nobody has added to has no rows to group, and therefore no entry.
  return rows.map((row) => ({ ...row, itemCount: byList.get(row.id) ?? 0 }));
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
  res.json(ListResourceListsResponse.parse(await withItemCounts(rows)));
});

// GET /lists, only the current user's own lists
router.get("/lists", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const rows = await db
    .select()
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.ownerId, userId), or(eq(resourceListsTable.workspaceRole, userRole as "student" | "teacher"), eq(resourceListsTable.workspaceRole, "shared"))!));
  res.json(ListResourceListsResponse.parse(await withItemCounts(rows)));
});

// POST /lists, any authenticated user
router.post("/lists", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const parsed = CreateResourceListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
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
    res.status(400).json({ error: validationMessage(params.error) });
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
  /*
   * Two queries for every resource in the list, however long the list is.
   * This ran one query for the row and one for its rating summary per item, so
   * opening a twelve-resource list cost twenty-five round trips -- and the
   * phone's Learning List screen opens exactly this endpoint.
   */
  const resources = await resourcesWithRatings(
    itemRows.map((item) => item.resourceId),
  );
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const items = itemRows.map((item) => ({
    ...item,
    resource: byId.get(item.resourceId) ?? null,
  }));
  res.json(GetResourceListResponse.parse({ ...list, items }));
});

// PATCH /lists/:id, owner only
router.patch("/lists/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = UpdateResourceListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can update this list" });
    return;
  }
  const parsed = UpdateResourceListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
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
    res.status(400).json({ error: validationMessage(params.error) });
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
  /*
   * One statement, because two were not atomic.
   *
   * The items were deleted first and the list second, with nothing holding
   * them together: a failure in between emptied somebody's list and left the
   * list there, which is the worst of both outcomes. `list_items.list_id`
   * carries ON DELETE CASCADE (checked against the database, not just the
   * schema), so deleting the list takes its items with it and the pair cannot
   * come apart.
   */
  await db.delete(resourceListsTable).where(eq(resourceListsTable.id, params.data.id));
  res.sendStatus(204);
});

// POST /lists/:id/items, owner only
router.post("/lists/:id/items", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = AddListItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can add items" });
    return;
  }
  const parsed = AddListItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }

  /*
   * One resource occupies one position in a Learning List.
   *
   * This is intentionally enforced at the write boundary rather than left to
   * every client. The lock key is the list's append lane, so two taps on the
   * same Add button queue, and two different resources cannot claim the same
   * next position; unrelated lists remain concurrent. The second duplicate
   * receives the existing item as a successful, explicit "already present"
   * result instead of creating a duplicate or surfacing a generic error.
   */
  const saved = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${params.data.id}, 0)`,
    );
    const [existing] = await tx
      .select()
      .from(listItemsTable)
      .where(
        and(
          eq(listItemsTable.listId, params.data.id),
          eq(listItemsTable.resourceId, parsed.data.resourceId),
        ),
      )
      .limit(1);
    if (existing) return { item: existing, alreadyPresent: true };

    const [maxResult] = await tx
      .select({ maxPos: max(listItemsTable.position) })
      .from(listItemsTable)
      .where(eq(listItemsTable.listId, params.data.id));
    const nextPosition = (maxResult?.maxPos ?? -1) + 1;
    const [item] = await tx
      .insert(listItemsTable)
      .values({ listId: params.data.id, position: nextPosition, ...parsed.data })
      .returning();
    return { item, alreadyPresent: false };
  });

  if (!saved.alreadyPresent) {
    await recordWorkflowEvent({
      userId,
      event: "resource_saved",
      resourceId: saved.item.resourceId,
      context: { listId: params.data.id },
    });
  }
  const resource = await resourceWithRating(saved.item.resourceId);
  res
    .status(saved.alreadyPresent ? 200 : 201)
    .json(
      AddListItemResponse.parse({
        ...saved.item,
        resource,
        alreadyPresent: saved.alreadyPresent,
      }),
    );
});

// POST /lists/:id/items/reorder, list owner only
// Must be registered before DELETE /lists/:id/items/:itemId so Express doesn't
// mistake "reorder" for an itemId.
router.post("/lists/:id/items/reorder", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = ReorderListItemsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can reorder items" });
    return;
  }
  const parsed = ReorderListItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }

  const submittedIds = parsed.data.itemIds;
  const submittedSet = new Set(submittedIds);

  /*
   * Read the items and write their positions in one transaction.
   *
   * The check and the writes were separate statements with nothing holding
   * them together, and the writes were a Promise.all of one UPDATE per item.
   * A failure part-way through -- a dropped connection, a pool timeout --
   * left the list in an order nobody chose: some items renumbered, some not,
   * two of them sharing a position and the tie broken by insertion time. That
   * is not a state the app can see or repair, and it is the order the learner
   * then studies in.
   *
   * It also could not see a concurrent change. The check read the item ids,
   * and by the time the updates ran an item removed on another device was
   * gone -- so the reorder wrote positions for a list that no longer matched
   * what was validated. Reading inside the transaction is what makes the
   * permutation check a statement about the rows actually being written.
   */
  const reordered = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: listItemsTable.id })
      .from(listItemsTable)
      .where(eq(listItemsTable.listId, params.data.id));
    const existingIds = new Set(existing.map((r) => r.id));

    if (
      submittedIds.length !== existingIds.size ||
      submittedIds.some((id) => !existingIds.has(id)) ||
      submittedIds.length !== submittedSet.size // no duplicates
    ) {
      return false;
    }

    // An empty list is already in the order it was asked for, and `values ()`
    // with no rows in it is a syntax error rather than a no-op.
    if (!submittedIds.length) return true;

    // One statement for every position, so the new order arrives whole or not
    // at all. `ordered(id, position)` is the submitted array as rows.
    const values = sql.join(
      submittedIds.map(
        (itemId, index) => sql`(${itemId}::int, ${index}::int)`,
      ),
      sql`, `,
    );
    await tx.execute(sql`
      update ${listItemsTable} as item
      set position = ordered.position
      from (values ${values}) as ordered(id, position)
      where item.id = ordered.id and item.list_id = ${params.data.id}
    `);
    return true;
  });

  if (!reordered) {
    res.status(400).json({ error: "itemIds must be an exact, duplicate-free permutation of the list's current items" });
    return;
  }
  res.sendStatus(204);
});

// DELETE /lists/:id/items/:itemId, list owner only
router.delete("/lists/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = RemoveListItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
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
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isListOwner(params.data.id, userId, userRole))) {
    res.status(403).json({ error: "Only the list owner can share this list" });
    return;
  }
  const parsed = ShareListWithClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
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
