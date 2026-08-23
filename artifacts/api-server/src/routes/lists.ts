/**
 * @fileOverview API role: implements the Lists HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, sql, and, max, asc, desc, inArray, or } from "drizzle-orm";
import { db, resourceListsTable, listItemsTable, resourcesTable, reviewsTable, classMembersTable, learningGoalsTable } from "@workspace/db";
import { publicResourceColumns } from "../lib/resourceColumns";
import {
  ListResourceListsResponse,
  ListResourceListMembershipsParams,
  ListResourceListMembershipsResponse,
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
  CreateLearningGoalFromListParams,
  CreateLearningGoalFromListResponse,
  GetPublicResourceListParams,
  GetPublicResourceListResponse,
  GetPublicListShareParams,
  GetPublicListShareResponse,
  CreatePublicListShareParams,
  CreatePublicListShareResponse,
  RevokePublicListShareParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { isListOwner, canReadList, isListItemOwner, isClassTeacher } from "../lib/authz";
import { recordWorkflowEvent } from "../lib/workflowAnalytics";

const router: IRouter = Router();

// This is current membership truth, not the historical workflow "saved" flag.
// Removing the item or list makes it disappear from this result immediately.
router.get(
  "/resources/:resourceId/list-memberships",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = ListResourceListMembershipsParams.safeParse({
      resourceId: Number(req.params.resourceId),
    });
    if (!params.success) {
      res.status(400).json({ error: "Invalid resource ID" });
      return;
    }
    const rows = await db
      .select({
        listId: resourceListsTable.id,
        listName: resourceListsTable.name,
        listItemId: listItemsTable.id,
        note: listItemsTable.note,
        addedAt: listItemsTable.addedAt,
      })
      .from(listItemsTable)
      .innerJoin(resourceListsTable, eq(resourceListsTable.id, listItemsTable.listId))
      .where(
        and(
          eq(listItemsTable.resourceId, params.data.resourceId),
          eq(resourceListsTable.ownerId, userId),
          or(
            eq(resourceListsTable.workspaceRole, userRole as "student" | "teacher"),
            eq(resourceListsTable.workspaceRole, "shared"),
          )!,
        ),
      )
      .orderBy(desc(listItemsTable.addedAt));
    res.json(ListResourceListMembershipsResponse.parse(rows));
  },
);

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

async function publicListByToken(token: string) {
  const [list] = await db
    .select({
      id: resourceListsTable.id,
      name: resourceListsTable.name,
      description: resourceListsTable.description,
      createdAt: resourceListsTable.createdAt,
    })
    .from(resourceListsTable)
    .where(eq(resourceListsTable.shareToken, token));
  if (!list) return null;

  // Public shares intentionally omit list-item notes, owner identity, and all
  // moderation fields. A private or rejected submission in an owner's list
  // must not become public merely because the list itself was shared.
  const rows = await db
    .select({
      resourceId: listItemsTable.resourceId,
      position: listItemsTable.position,
      id: resourcesTable.id,
      title: resourcesTable.title,
      url: resourcesTable.url,
      description: resourcesTable.description,
      format: resourcesTable.format,
      subject: resourcesTable.subject,
      gradeLevel: resourcesTable.gradeLevel,
      thumbnailUrl: resourcesTable.thumbnailUrl,
      createdAt: resourcesTable.createdAt,
      avgRating: sql<number>`round(coalesce((select avg(${reviewsTable.rating}) from ${reviewsTable} where ${reviewsTable.resourceId} = ${resourcesTable.id}), 0)::numeric, 1)::float`,
      reviewCount: sql<number>`cast((select count(*) from ${reviewsTable} where ${reviewsTable.resourceId} = ${resourcesTable.id}) as int)`,
    })
    .from(listItemsTable)
    .innerJoin(resourcesTable, eq(resourcesTable.id, listItemsTable.resourceId))
    .where(
      and(
        eq(listItemsTable.listId, list.id),
        eq(resourcesTable.verificationStatus, "verified"),
      ),
    )
    .orderBy(asc(listItemsTable.position), asc(listItemsTable.addedAt));

  return {
    name: list.name,
    description: list.description,
    itemCount: rows.length,
    createdAt: list.createdAt,
    items: rows.map((row) => ({
      resourceId: row.resourceId,
      position: row.position,
      resource: {
        id: row.id,
        title: row.title,
        url: row.url,
        description: row.description,
        format: row.format,
        subject: row.subject,
        gradeLevel: row.gradeLevel,
        thumbnailUrl: row.thumbnailUrl,
        avgRating: row.avgRating,
        reviewCount: row.reviewCount,
        createdAt: row.createdAt,
      },
    })),
  };
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

// GET /lists/public/:token, intentionally public and capability-token gated.
router.get("/lists/public/:token", async (req, res): Promise<void> => {
  const params = GetPublicResourceListParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Shared list not found" });
    return;
  }
  const list = await publicListByToken(params.data.token);
  if (!list) {
    res.status(404).json({ error: "Shared list not found" });
    return;
  }
  res.json(GetPublicResourceListResponse.parse(list));
});

// GET /lists/:id/public-share, owner-only status. The token is never included
// in ordinary list responses, including class-shared list responses.
router.get(
  "/lists/:id/public-share",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = GetPublicListShareParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [list] = await db
      .select({ id: resourceListsTable.id, shareToken: resourceListsTable.shareToken })
      .from(resourceListsTable)
      .where(eq(resourceListsTable.id, params.data.id));
    if (!list) {
      res.status(404).json({ error: "List not found" });
      return;
    }
    if (!(await isListOwner(params.data.id, userId, userRole))) {
      res.status(403).json({ error: "Only the list owner can manage its public link" });
      return;
    }
    res.json(GetPublicListShareResponse.parse({ shareToken: list.shareToken }));
  },
);

// POST is idempotent: repeated clicks return the same live URL rather than
// invalidating links that a teacher may already have distributed.
router.post(
  "/lists/:id/public-share",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = CreatePublicListShareParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [list] = await db
      .select({ id: resourceListsTable.id, shareToken: resourceListsTable.shareToken })
      .from(resourceListsTable)
      .where(eq(resourceListsTable.id, params.data.id));
    if (!list) {
      res.status(404).json({ error: "List not found" });
      return;
    }
    if (!(await isListOwner(params.data.id, userId, userRole))) {
      res.status(403).json({ error: "Only the list owner can create a public link" });
      return;
    }
    if (list.shareToken) {
      res.json(
        CreatePublicListShareResponse.parse({ shareToken: list.shareToken }),
      );
      return;
    }

    const shareToken = randomUUID();
    const [updated] = await db
      .update(resourceListsTable)
      .set({ shareToken })
      .where(eq(resourceListsTable.id, params.data.id))
      .returning({ shareToken: resourceListsTable.shareToken });
    res
      .status(201)
      .json(CreatePublicListShareResponse.parse(updated ?? { shareToken }));
  },
);

router.delete(
  "/lists/:id/public-share",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const params = RevokePublicListShareParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [list] = await db
      .select({ id: resourceListsTable.id })
      .from(resourceListsTable)
      .where(eq(resourceListsTable.id, params.data.id));
    if (!list) {
      res.status(404).json({ error: "List not found" });
      return;
    }
    if (!(await isListOwner(params.data.id, userId, userRole))) {
      res.status(403).json({ error: "Only the list owner can revoke a public link" });
      return;
    }
    await db
      .update(resourceListsTable)
      .set({ shareToken: null })
      .where(eq(resourceListsTable.id, params.data.id));
    res.sendStatus(204);
  },
);

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
  // The unique (list_id, resource_id) index makes this race-safe. A retry may
  // arrive after the first request committed, or two devices may save at once;
  // onConflictDoNothing lets both requests converge on the same durable row.
  const [insertedItem] = await db
    .insert(listItemsTable)
    .values({ listId: params.data.id, position: nextPosition, ...parsed.data })
    .onConflictDoNothing({
      target: [listItemsTable.listId, listItemsTable.resourceId],
    })
    .returning();
  const [existingItem] = insertedItem
    ? [insertedItem]
    : await db
        .select()
        .from(listItemsTable)
        .where(
          and(
            eq(listItemsTable.listId, params.data.id),
            eq(listItemsTable.resourceId, parsed.data.resourceId),
          ),
        );
  const item = insertedItem ?? existingItem;
  if (!item) {
    // This can only happen if a concurrent delete wins immediately after the
    // conflict. A retry is safe and is clearer than returning a false success.
    res.status(409).json({ error: "The resource changed while it was being saved. Please retry." });
    return;
  }
  if (insertedItem) {
    await Promise.all([
      recordWorkflowEvent({
        userId,
        event: "resource_saved",
        resourceId: item.resourceId,
        context: { listId: params.data.id },
      }),
      recordWorkflowEvent({
        userId,
        event: "resource_added_to_list",
        resourceId: item.resourceId,
        context: { listId: params.data.id },
      }),
    ]);
  }
  const resource = await resourceWithRating(item.resourceId);
  res.status(insertedItem ? 201 : 200).json(AddListItemResponse.parse({ ...item, resource }));
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

// POST /lists/:id/learning-goal, turn the list's saved order into a path.
// The source-list uniqueness constraint makes repeat and concurrent requests
// idempotent for each user and workspace.
router.post("/lists/:id/learning-goal", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const params = CreateLearningGoalFromListParams.safeParse(req.params);
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
  const workspaceRole = userRole === "teacher" ? "teacher" : "student";
  const [existingGoal] = await db
    .select()
    .from(learningGoalsTable)
    .where(
      and(
        eq(learningGoalsTable.userId, userId),
        eq(learningGoalsTable.workspaceRole, workspaceRole),
        eq(learningGoalsTable.sourceListId, list.id),
      ),
    );
  if (existingGoal) {
    res.json(CreateLearningGoalFromListResponse.parse(existingGoal));
    return;
  }

  const itemRows = await db
    .select({
      resourceId: listItemsTable.resourceId,
      title: resourcesTable.title,
      subject: resourcesTable.subject,
      format: resourcesTable.format,
    })
    .from(listItemsTable)
    .innerJoin(resourcesTable, eq(resourcesTable.id, listItemsTable.resourceId))
    .where(eq(listItemsTable.listId, list.id))
    .orderBy(asc(listItemsTable.position), asc(listItemsTable.addedAt));
  if (!itemRows.length) {
    res.status(400).json({ error: "Add at least one resource before creating a learning path" });
    return;
  }

  const pathItems = itemRows.slice(0, 20);
  const subjectCounts = new Map<string, number>();
  for (const item of pathItems)
    subjectCounts.set(item.subject, (subjectCounts.get(item.subject) ?? 0) + 1);
  const subject = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Interdisciplinary";
  const preferredFormats = [...new Set(pathItems.map((item) => item.format))].slice(0, 6);
  const [created] = await db
    .insert(learningGoalsTable)
    .values({
      userId,
      workspaceRole,
      sourceListId: list.id,
      title: list.name,
      subject,
      description:
        itemRows.length > 20
          ? `Learning path created from the first 20 of ${itemRows.length} resources in “${list.name}”.`
          : `Learning path created from the ordered resource list “${list.name}”.`,
      level: "beginner",
      preferredFormats,
      pathSteps: pathItems.map((item) => ({
        id: randomUUID(),
        title: item.title,
        query: `${item.subject} ${item.title}`,
        completed: false,
        resourceId: item.resourceId,
      })),
    })
    .onConflictDoNothing({
      target: [
        learningGoalsTable.userId,
        learningGoalsTable.workspaceRole,
        learningGoalsTable.sourceListId,
      ],
    })
    .returning();
  if (created) {
    await Promise.all([
      recordWorkflowEvent({
        userId,
        event: "goal_created",
        context: {
          source: "resource_list",
          resourceCount: pathItems.length,
          workspaceRole,
        },
      }),
      recordWorkflowEvent({
        userId,
        event: "resource_added_to_goal",
        resourceId: pathItems[0]?.resourceId,
        context: {
          resourceCount: pathItems.length,
          workspaceRole,
        },
      }),
    ]);
    res.status(201).json(CreateLearningGoalFromListResponse.parse(created));
    return;
  }

  const [concurrentGoal] = await db
    .select()
    .from(learningGoalsTable)
    .where(
      and(
        eq(learningGoalsTable.userId, userId),
        eq(learningGoalsTable.workspaceRole, workspaceRole),
        eq(learningGoalsTable.sourceListId, list.id),
      ),
    );
  if (!concurrentGoal) {
    res.status(409).json({ error: "Learning path creation is already in progress" });
    return;
  }
  res.json(CreateLearningGoalFromListResponse.parse(concurrentGoal));
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
