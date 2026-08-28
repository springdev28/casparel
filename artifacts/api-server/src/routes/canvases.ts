/**
 * @fileOverview API role: implements the Canvases HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod/v4";
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
import { ensureAccountCapacity } from "../lib/planCapacity";
import { ensureStorageCapacity } from "../lib/storageCapacity";
import { validationMessage } from "../lib/validationMessage";

const router: IRouter = Router();

const nodeDataSchema = z.object({
  kind: z.enum(["note", "heading", "link", "resource"]),
  title: z.string().max(240),
  text: z.string().max(10_000).optional(),
  url: z.string().url().max(2_000).optional(),
  resourceId: z.number().int().positive().optional(),
  color: z.string().max(40).optional(),
});

const documentSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        type: z.literal("study"),
        position: z.object({ x: z.number().finite(), y: z.number().finite() }),
        data: nodeDataSchema,
      }),
    )
    .max(500),
  edges: z
    .array(
      z.object({
        id: z.string().min(1).max(160),
        source: z.string().min(1).max(120),
        target: z.string().min(1).max(120),
        sourceHandle: z.enum(["top", "right", "bottom", "left"]).optional(),
        targetHandle: z.enum(["top", "right", "bottom", "left"]).optional(),
        direction: z.enum(["one-way", "two-way", "line"]).optional(),
        label: z.string().max(200).optional(),
      }),
    )
    .max(1_000),
  viewport: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: z.number().min(0.1).max(4),
    })
    .optional(),
});

const createCanvasSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1_000).optional(),
  classId: z.number().int().positive().nullable().optional(),
  classAccess: z.enum(["view", "edit"]).optional(),
});

const updateCanvasSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    visibility: z.enum(["private", "people", "class", "link"]).optional(),
    classAccess: z.enum(["view", "edit"]).optional(),
    document: documentSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine((value) => !value.document || value.expectedVersion != null, {
    message: "expectedVersion is required when saving the canvas",
  });

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
  res.json((await Promise.all(visible)).filter(Boolean));
});

router.post(
  "/canvases",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const parsed = createCanvasSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
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
    if (!(await ensureAccountCapacity(res, userId, "canvases"))) return;
    const [canvas] = await db
      .insert(canvasesTable)
      .values({
        title: parsed.data.title,
        description: parsed.data.description || null,
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
    res.status(201).json(await decorateCanvas(canvas, access));
  },
);

router.get(
  "/canvases/shared/:token",
  async (req, res): Promise<void> => {
    const [canvas] = await db
      .select()
      .from(canvasesTable)
      .where(eq(canvasesTable.shareToken, req.params.token));
    if (!canvas || canvas.visibility !== "link") {
      res.status(404).json({ error: "Shared canvas not found" });
      return;
    }
    res.json({
      ...(await decorateCanvas(canvas, {
        canView: true,
        canEdit: false,
        canManage: false,
        role: "viewer",
      })),
      shareToken: undefined,
    });
  },
);

router.get("/canvases/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid canvas ID" });
    return;
  }
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
  res.json(await decorateCanvas(canvas, access));
});

/**
 * POST /canvases/:id/copy
 *
 * Your own copy of a canvas you can see, for the same reason as activities:
 * people want to build on someone else's board without editing theirs, and
 * without needing edit rights they were never given.
 *
 * The copy is private and detached. No classId, so it is not shared back into
 * the class it came from; no shareToken, so the original link cannot reach it;
 * no collaborators, so the people on the source board have no rights on yours.
 * The document is copied by value, so neither board can change the other
 * afterwards.
 */
router.post(
  "/canvases/:id/copy",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, accountRole } = req as AuthenticatedRequest;
    const canvasId = Number(req.params.id);
    if (!Number.isInteger(canvasId) || canvasId <= 0) {
      res.status(400).json({ error: "Invalid canvas id" });
      return;
    }
    const [source] = await db
      .select()
      .from(canvasesTable)
      .where(eq(canvasesTable.id, canvasId));
    if (!source) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    // Reuse the same access rules the rest of the file uses, so a copy can
    // never reach further than a view can.
    const access = await accessForCanvas(source, userId, accountRole);
    if (!access?.canView) {
      res.status(403).json({ error: "You do not have access to this canvas" });
      return;
    }
    if (!(await ensureAccountCapacity(res, userId, "canvases"))) return;
    if (!(await ensureStorageCapacity(
      res,
      userId,
      Buffer.byteLength(JSON.stringify(source.document), "utf8"),
    ))) return;

    const [copy] = await db
      .insert(canvasesTable)
      .values({
        title: source.title,
        description: source.description,
        ownerId: userId,
        classId: null,
        visibility: "private",
        classAccess: "view",
        shareToken: null,
        document: source.document,
      })
      .returning();
    const ownerAccess: CanvasAccess = {
      canView: true,
      canEdit: true,
      canManage: true,
      role: "owner",
    };
    res.status(201).json(await decorateCanvas(copy, ownerAccess));
  },
);

router.patch(
  "/canvases/:id",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = updateCanvasSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error, "Invalid canvas ID") });
      return;
    }
    const canvas = await getCanvasRow(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    const { userId, accountRole } = req as AuthenticatedRequest;
    const access = await accessForCanvas(canvas, userId, accountRole);
    if (!access?.canView || (parsed.data.document && !access.canEdit)) {
      res.status(403).json({ error: "You cannot edit this canvas" });
      return;
    }
    const changesMetadata =
      parsed.data.title !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.visibility !== undefined ||
      parsed.data.classAccess !== undefined;
    if (changesMetadata && !access.canManage) {
      res.status(403).json({ error: "Only the canvas owner can change sharing settings" });
      return;
    }
    if (
      parsed.data.document !== undefined &&
      !(await ensureStorageCapacity(
        res,
        canvas.ownerId,
        Buffer.byteLength(JSON.stringify(parsed.data.document), "utf8"),
      ))
    ) return;
    const values: Partial<typeof canvasesTable.$inferInsert> = {
      updatedAt: new Date().toISOString(),
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.visibility !== undefined
        ? { visibility: parsed.data.visibility }
        : {}),
      ...(parsed.data.classAccess !== undefined
        ? { classAccess: parsed.data.classAccess }
        : {}),
      ...(parsed.data.document !== undefined
        ? { document: parsed.data.document as CanvasDocument }
        : {}),
    };
    if (parsed.data.visibility === "link" && !canvas.shareToken) {
      values.shareToken = randomBytes(24).toString("base64url");
    }
    const condition = parsed.data.document
      ? and(
          eq(canvasesTable.id, id),
          eq(canvasesTable.version, parsed.data.expectedVersion!),
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
        current: current ? await decorateCanvas(current, access) : null,
      });
      return;
    }
    res.json(await decorateCanvas(updated, access));
  },
);

router.post(
  "/canvases/:id/publish",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const canvas = Number.isInteger(id) ? await getCanvasRow(id) : null;
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
    const destination = req.body?.destination === "forum" ? "forum" : "catalog";
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
    res.status(201).json({ materialId, shareToken, destination });
  },
);

router.delete("/canvases/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const canvas = Number.isInteger(id) ? await getCanvasRow(id) : null;
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
    const id = Number(req.params.id);
    const canvas = Number.isInteger(id) ? await getCanvasRow(id) : null;
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
    res.json(collaborators);
  },
);

router.put(
  "/canvases/:id/collaborators/:userId",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const collaboratorUserId = Number(req.params.userId);
    const role = z.enum(["viewer", "editor"]).safeParse(req.body?.role);
    const canvas = Number.isInteger(id) ? await getCanvasRow(id) : null;
    if (!canvas || !Number.isInteger(collaboratorUserId) || !role.success) {
      res.status(400).json({ error: "Invalid collaborator request" });
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
    await db
      .insert(canvasCollaboratorsTable)
      .values({ canvasId: id, userId: collaboratorUserId, role: role.data, addedById: userId })
      .onConflictDoUpdate({
        target: [canvasCollaboratorsTable.canvasId, canvasCollaboratorsTable.userId],
        set: { role: role.data, addedById: userId },
      });
    res.json({ ok: true });
  },
);

router.delete(
  "/canvases/:id/collaborators/:userId",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const collaboratorUserId = Number(req.params.userId);
    const canvas = Number.isInteger(id) ? await getCanvasRow(id) : null;
    if (!canvas || !Number.isInteger(collaboratorUserId)) {
      res.status(400).json({ error: "Invalid collaborator request" });
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
