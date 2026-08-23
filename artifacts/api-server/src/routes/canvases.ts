/**
 * @fileOverview API role: implements the Canvases HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import {
  CreateCanvasBody,
  CreateCanvasResponse,
  DeleteCanvasParams,
  GetCanvasParams,
  GetCanvasResponse,
  GetSharedCanvasParams,
  GetSharedCanvasResponse,
  ListCanvasCollaboratorsParams,
  ListCanvasCollaboratorsResponse,
  ListCanvasesResponse,
  PublishCanvasBody,
  PublishCanvasParams,
  PublishCanvasResponse,
  RemoveCanvasCollaboratorParams,
  UpdateCanvasBody,
  UpdateCanvasParams,
  UpdateCanvasResponse,
  UpsertCanvasCollaboratorBody,
  UpsertCanvasCollaboratorParams,
  UpsertCanvasCollaboratorResponse,
} from "@workspace/api-zod";
import {
  canvasCollaboratorsTable,
  canvasesTable,
  classesTable,
  classMembersTable,
  db,
  forumMaterialsTable,
  forumPostsTable,
  usersTable,
  type Canvas,
  type CanvasDocument,
} from "@workspace/db";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";

const router: IRouter = Router();

/**
 * Effective permissions are computed once per request and returned to the UI.
 * The UI uses these flags to expose editing controls, but every mutation still
 * rechecks them here so a crafted request cannot bypass the collaboration rules.
 */
type CanvasAccess = {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  role: "owner" | "editor" | "viewer" | "class-editor" | "class-viewer";
};

async function getCanvasRow(id: number) {
  const [canvas] = await db
    .select()
    .from(canvasesTable)
    .where(eq(canvasesTable.id, id));
  return canvas ?? null;
}

/**
 * Access is intentionally resolved from most explicit to most implicit:
 * owner/admin, named collaborator, class teacher, then class membership.
 */
async function accessForCanvas(
  canvas: Canvas,
  userId: number,
  accountRole: string,
): Promise<CanvasAccess | null> {
  if (accountRole === "admin" || canvas.ownerId === userId) {
    return { canView: true, canEdit: true, canManage: true, role: "owner" };
  }

  const [collaborator] = await db
    .select({ role: canvasCollaboratorsTable.role })
    .from(canvasCollaboratorsTable)
    .where(
      and(
        eq(canvasCollaboratorsTable.canvasId, canvas.id),
        eq(canvasCollaboratorsTable.userId, userId),
      ),
    );
  if (collaborator) {
    const canEdit = collaborator.role === "editor";
    return {
      canView: true,
      canEdit,
      canManage: false,
      role: canEdit ? "editor" : "viewer",
    };
  }

  if (canvas.classId != null) {
    const [cls] = await db
      .select({ teacherId: classesTable.teacherId })
      .from(classesTable)
      .where(eq(classesTable.id, canvas.classId));
    if (cls?.teacherId === userId) {
      return { canView: true, canEdit: true, canManage: true, role: "owner" };
    }
    if (canvas.visibility === "class") {
      const [membership] = await db
        .select({ role: classMembersTable.role })
        .from(classMembersTable)
        .where(
          and(
            eq(classMembersTable.classId, canvas.classId),
            eq(classMembersTable.userId, userId),
          ),
        );
      if (membership) {
        const canEdit =
          membership.role === "teacher" || canvas.classAccess === "edit";
        return {
          canView: true,
          canEdit,
          canManage: membership.role === "teacher",
          role: canEdit ? "class-editor" : "class-viewer",
        };
      }
    }
  }
  return null;
}

/** Attach display references and the caller's effective permissions to a row. */
async function decorateCanvas(canvas: Canvas, access: CanvasAccess) {
  const [[owner], [cls], [{ collaboratorCount }]] = await Promise.all([
    db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, canvas.ownerId)),
    canvas.classId
      ? db
          .select({ id: classesTable.id, name: classesTable.name })
          .from(classesTable)
          .where(eq(classesTable.id, canvas.classId))
      : Promise.resolve([]),
    db
      .select({
        collaboratorCount: sql<number>`cast(count(*) as int)`,
      })
      .from(canvasCollaboratorsTable)
      .where(eq(canvasCollaboratorsTable.canvasId, canvas.id)),
  ]);
  return {
    ...canvas,
    owner: owner ?? null,
    class: cls ?? null,
    collaboratorCount,
    permissions: access,
  };
}

router.get("/canvases", requireAuth, async (req, res): Promise<void> => {
  const { userId, accountRole } = req as AuthenticatedRequest;
  const rows = await db
    .select()
    .from(canvasesTable)
    .orderBy(desc(canvasesTable.updatedAt))
    .limit(250);
  const visible = await Promise.all(
    rows.map(async (canvas) => {
      const access = await accessForCanvas(canvas, userId, accountRole);
      return access ? decorateCanvas(canvas, access) : null;
    }),
  );
  res.json(ListCanvasesResponse.parse(visible.filter(Boolean)));
});

router.post(
  "/canvases",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const parsed = CreateCanvasBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const title = parsed.data.title.trim();
    if (!title) {
      res.status(400).json({ error: "Canvas title cannot be blank" });
      return;
    }
    const classId = parsed.data.classId ?? null;
    if (classId != null) {
      const [cls] = await db
        .select({ teacherId: classesTable.teacherId })
        .from(classesTable)
        .where(eq(classesTable.id, classId));
      if (!cls || cls.teacherId !== userId) {
        res.status(403).json({ error: "Only the class teacher can create a class canvas" });
        return;
      }
    }
    const [canvas] = await db
      .insert(canvasesTable)
      .values({
        title,
        description: parsed.data.description?.trim() || null,
        ownerId: userId,
        classId,
        visibility: classId ? "class" : "private",
        classAccess: parsed.data.classAccess ?? "view",
      })
      .returning();
    const access: CanvasAccess = {
      canView: true,
      canEdit: true,
      canManage: true,
      role: "owner",
    };
    res
      .status(201)
      .json(CreateCanvasResponse.parse(await decorateCanvas(canvas, access)));
  },
);

router.get(
  "/canvases/shared/:token",
  async (req, res): Promise<void> => {
    const parsed = GetSharedCanvasParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [canvas] = await db
      .select()
      .from(canvasesTable)
      .where(eq(canvasesTable.shareToken, parsed.data.token));
    if (!canvas || canvas.visibility !== "link") {
      res.status(404).json({ error: "Shared canvas not found" });
      return;
    }
    // Parsing with the public schema removes shareToken from the serialized view.
    res.json(
      GetSharedCanvasResponse.parse(
        await decorateCanvas(canvas, {
        canView: true,
        canEdit: false,
        canManage: false,
        role: "viewer",
        }),
      ),
    );
  },
);

router.get("/canvases/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetCanvasParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { id } = parsed.data;
  const canvas = await getCanvasRow(id);
  if (!canvas) {
    res.status(404).json({ error: "Canvas not found" });
    return;
  }
  const { userId, accountRole } = req as AuthenticatedRequest;
  const access = await accessForCanvas(canvas, userId, accountRole);
  if (!access) {
    res.status(403).json({ error: "You do not have access to this canvas" });
    return;
  }
  res.json(GetCanvasResponse.parse(await decorateCanvas(canvas, access)));
});

router.patch(
  "/canvases/:id",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const parsedParams = UpdateCanvasParams.safeParse(req.params);
    const parsedBody = UpdateCanvasBody.safeParse(req.body);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const { id } = parsedParams.data;
    const data = parsedBody.data;
    const title = data.title?.trim();
    if (data.title !== undefined && !title) {
      res.status(400).json({ error: "Canvas title cannot be blank" });
      return;
    }
    if (data.document !== undefined && data.expectedVersion == null) {
      res.status(400).json({
        error: "expectedVersion is required when saving the canvas",
      });
      return;
    }
    const canvas = await getCanvasRow(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    const { userId, accountRole } = req as AuthenticatedRequest;
    const access = await accessForCanvas(canvas, userId, accountRole);
    if (!access?.canView || (data.document !== undefined && !access.canEdit)) {
      res.status(403).json({ error: "You cannot edit this canvas" });
      return;
    }
    const changesMetadata =
      data.title !== undefined ||
      data.description !== undefined ||
      data.visibility !== undefined ||
      data.classAccess !== undefined;
    if (changesMetadata && !access.canManage) {
      res.status(403).json({ error: "Only the canvas owner can change sharing settings" });
      return;
    }
    const values: Partial<typeof canvasesTable.$inferInsert> = {
      updatedAt: new Date().toISOString(),
      ...(data.title !== undefined ? { title } : {}),
      ...(data.description !== undefined
        ? {
            description:
              typeof data.description === "string"
                ? data.description.trim()
                : data.description,
          }
        : {}),
      ...(data.visibility !== undefined
        ? { visibility: data.visibility }
        : {}),
      ...(data.classAccess !== undefined
        ? { classAccess: data.classAccess }
        : {}),
      ...(data.document !== undefined
        ? { document: data.document as CanvasDocument }
        : {}),
    };
    if (data.visibility === "link" && !canvas.shareToken) {
      values.shareToken = randomBytes(24).toString("base64url");
    }
    // Content saves are version-gated; metadata-only changes do not overwrite graph data.
    const condition = data.document
      ? and(
          eq(canvasesTable.id, id),
          eq(canvasesTable.version, data.expectedVersion!),
        )
      : eq(canvasesTable.id, id);
    const [updated] = await db
      .update(canvasesTable)
      .set({ ...values, version: sql`${canvasesTable.version} + 1` })
      .where(condition)
      .returning();
    if (!updated) {
      const current = await getCanvasRow(id);
      res.status(409).json({
        error: "This canvas changed in another session",
        current: current
          ? UpdateCanvasResponse.parse(await decorateCanvas(current, access))
          : null,
      });
      return;
    }
    res.json(UpdateCanvasResponse.parse(await decorateCanvas(updated, access)));
  },
);

router.post(
  "/canvases/:id/publish",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const parsedParams = PublishCanvasParams.safeParse(req.params);
    const parsedBody = PublishCanvasBody.safeParse(req.body ?? {});
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const { id } = parsedParams.data;
    const canvas = await getCanvasRow(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    const auth = req as AuthenticatedRequest;
    const access = await accessForCanvas(canvas, auth.userId, auth.accountRole);
    if (!access?.canManage) {
      res.status(403).json({ error: "Only the canvas owner can publish it" });
      return;
    }
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId));
    if (!user) {
      res.status(401).json({ error: "Account not found" });
      return;
    }
    const shareToken = canvas.shareToken ?? randomBytes(24).toString("base64url");
    if (!canvas.shareToken || canvas.visibility !== "link") {
      await db.update(canvasesTable)
        .set({ shareToken, visibility: "link", updatedAt: new Date().toISOString() })
        .where(eq(canvasesTable.id, canvas.id));
    }
    // The stable title lets repeated publishes reuse the same catalog material.
    const materialTitle = `${canvas.title} (Casparel canvas ${canvas.id})`;
    const [existingMaterial] = await db
      .select({ id: forumMaterialsTable.id })
      .from(forumMaterialsTable)
      .where(ilike(forumMaterialsTable.title, materialTitle));
    let materialId = existingMaterial?.id;
    if (!materialId) {
      const [material] = await db.insert(forumMaterialsTable).values({
        title: materialTitle,
        description: canvas.description || `Collaborative canvas with ${canvas.document.nodes.length} cards.`,
        unit: canvas.classId ? "Class canvas" : "Community canvas",
        topic: canvas.title,
        materialType: "activity",
        tags: ["canvas", "collaborative", "visual-learning"],
        sources: [],
        uploaderId: user.id,
        uploaderName: user.name,
        uploaderRole: auth.accountRole === "admin" ? "admin" : auth.userRole === "teacher" ? "teacher" : "student",
        linkUrl: `/canvas/shared/${shareToken}`,
      }).returning({ id: forumMaterialsTable.id });
      materialId = material.id;
    }
    const { destination } = parsedBody.data;
    if (destination === "forum") {
      const [existingPost] = await db
        .select({ id: forumPostsTable.id })
        .from(forumPostsTable)
        .where(and(
          eq(forumPostsTable.authorId, auth.userId),
          eq(forumPostsTable.attachmentMaterialId, materialId),
        ));
      if (!existingPost) {
        await db.insert(forumPostsTable).values({
          authorId: user.id,
          authorName: user.name,
          authorRole: auth.accountRole === "admin" ? "admin" : auth.userRole === "teacher" ? "teacher" : "student",
          kind: "post",
          title: canvas.title,
          body: "Explore and collaborate on my Casparel canvas.",
          tags: ["canvas", "shared-material"],
          attachmentMaterialId: materialId,
        });
      }
    }
    res
      .status(201)
      .json(PublishCanvasResponse.parse({ materialId, shareToken, destination }));
  },
);

router.delete("/canvases/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteCanvasParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { id } = parsed.data;
  const canvas = await getCanvasRow(id);
  if (!canvas) {
    res.status(404).json({ error: "Canvas not found" });
    return;
  }
  const { userId, accountRole } = req as AuthenticatedRequest;
  const access = await accessForCanvas(canvas, userId, accountRole);
  if (!access?.canManage) {
    res.status(403).json({ error: "Only the canvas owner can delete it" });
    return;
  }
  await db.delete(canvasesTable).where(eq(canvasesTable.id, id));
  res.status(204).end();
});

router.get(
  "/canvases/:id/collaborators",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ListCanvasCollaboratorsParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { id } = parsed.data;
    const canvas = await getCanvasRow(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    const { userId, accountRole } = req as AuthenticatedRequest;
    const access = await accessForCanvas(canvas, userId, accountRole);
    if (!access?.canView) {
      res.status(403).json({ error: "You do not have access to this canvas" });
      return;
    }
    const collaborators = await db
      .select({
        userId: canvasCollaboratorsTable.userId,
        role: canvasCollaboratorsTable.role,
        createdAt: canvasCollaboratorsTable.createdAt,
        name: usersTable.name,
        email: usersTable.email,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(canvasCollaboratorsTable)
      .innerJoin(usersTable, eq(usersTable.id, canvasCollaboratorsTable.userId))
      .where(eq(canvasCollaboratorsTable.canvasId, id));
    res.json(ListCanvasCollaboratorsResponse.parse(collaborators));
  },
);

router.put(
  "/canvases/:id/collaborators/:userId",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const parsedParams = UpsertCanvasCollaboratorParams.safeParse(req.params);
    const parsedBody = UpsertCanvasCollaboratorBody.safeParse(req.body);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const { id, userId: collaboratorUserId } = parsedParams.data;
    const { role } = parsedBody.data;
    const canvas = await getCanvasRow(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    const { userId, accountRole } = req as AuthenticatedRequest;
    const access = await accessForCanvas(canvas, userId, accountRole);
    if (!access?.canManage) {
      res.status(403).json({ error: "Only the canvas owner can manage collaborators" });
      return;
    }
    if (collaboratorUserId === canvas.ownerId) {
      res.status(400).json({ error: "The owner is already an editor" });
      return;
    }
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, collaboratorUserId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    // The composite key turns add and role-change into one idempotent operation.
    await db
      .insert(canvasCollaboratorsTable)
      .values({ canvasId: id, userId: collaboratorUserId, role, addedById: userId })
      .onConflictDoUpdate({
        target: [canvasCollaboratorsTable.canvasId, canvasCollaboratorsTable.userId],
        set: { role, addedById: userId },
      });
    res.json(UpsertCanvasCollaboratorResponse.parse({ ok: true }));
  },
);

router.delete(
  "/canvases/:id/collaborators/:userId",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = RemoveCanvasCollaboratorParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { id, userId: collaboratorUserId } = parsed.data;
    const canvas = await getCanvasRow(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    const { userId, accountRole } = req as AuthenticatedRequest;
    const access = await accessForCanvas(canvas, userId, accountRole);
    if (!access?.canManage) {
      res.status(403).json({ error: "Only the canvas owner can manage collaborators" });
      return;
    }
    await db
      .delete(canvasCollaboratorsTable)
      .where(
        and(
          eq(canvasCollaboratorsTable.canvasId, id),
          eq(canvasCollaboratorsTable.userId, collaboratorUserId),
        ),
      );
    res.status(204).end();
  },
);

export default router;
