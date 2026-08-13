import { randomBytes, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import {
  db,
  forumMaterialsTable,
  forumPostsTable,
  resourcesTable,
  studyActivitiesTable,
  usersTable,
  workflowEventsTable,
  type StudyActivityCard,
} from "@workspace/db";
import { contentLimiter } from "../lib/limiters";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { isClassMember, isClassTeacher } from "../lib/authz";
import { recordWorkflowEvent } from "../lib/workflowAnalytics";

const router: IRouter = Router();
const IMAGE_DATA_PATTERN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_IMAGE_BYTES = 140 * 1024;
const MAX_IMAGES_PER_ACTIVITY = 6;
const MAX_ACTIVITY_IMAGE_BYTES = 700 * 1024;
const ACTIVITY_MODES = new Set([
  "all", "flashcards", "practice", "quiz", "true-false", "match", "scramble", "missing-word", "random",
]);

function parseImageData(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = IMAGE_DATA_PATTERN.exec(value);
  if (!match) return undefined;
  const bytes = Buffer.from(match[2], "base64").byteLength;
  if (!bytes || bytes > MAX_IMAGE_BYTES) return undefined;
  return { value, bytes };
}

function activeWorkspaceRole(userRole: string) {
  return userRole === "teacher" ? "teacher" : "student";
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function resourceForSourceActivity(activityId: number | null) {
  if (!activityId) return null;
  const [event] = await db
    .select({ resourceId: workflowEventsTable.resourceId })
    .from(workflowEventsTable)
    .where(eq(workflowEventsTable.activityId, activityId))
    .orderBy(desc(workflowEventsTable.createdAt))
    .limit(1);
  return event?.resourceId ?? null;
}

function parseActivityInput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as {
    title?: unknown;
    subject?: unknown;
    mode?: unknown;
    cards?: unknown;
  };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const subject =
    typeof input.subject === "string" ? input.subject.trim() : "";
  const mode = typeof input.mode === "string" && ACTIVITY_MODES.has(input.mode)
    ? input.mode as "all" | "flashcards" | "practice" | "quiz" | "true-false" | "match" | "scramble" | "missing-word" | "random"
    : "flashcards";
  if (title.length < 2 || title.length > 160 || !Array.isArray(input.cards)) {
    return null;
  }
  const cards: StudyActivityCard[] = [];
  let imageCount = 0;
  let imageBytes = 0;
  for (const item of input.cards.slice(0, 100)) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as {
      id?: unknown;
      term?: unknown;
      answer?: unknown;
      choices?: unknown;
      correctChoiceIndex?: unknown;
      imageData?: unknown;
      imageAlt?: unknown;
    };
    const term = typeof candidate.term === "string" ? candidate.term.trim() : "";
    const answer =
      typeof candidate.answer === "string" ? candidate.answer.trim() : "";
    if (!term || !answer || term.length > 500 || answer.length > 1000) {
      return null;
    }
    if (mode === "true-false" && !["true", "false", "doğru", "yanlış", "dogru", "yanlis"].includes(answer.toLocaleLowerCase("tr"))) return null;
    if (mode === "missing-word" && !term.includes("____")) return null;
    const choices = Array.isArray(candidate.choices)
      ? candidate.choices
          .map((choice) => typeof choice === "string" ? choice.trim() : "")
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const correctChoiceIndex = Number(candidate.correctChoiceIndex);
    if (mode === "quiz") {
      if (
        choices.length < 2 ||
        new Set(choices.map((choice) => choice.toLocaleLowerCase())).size !== choices.length ||
        !Number.isInteger(correctChoiceIndex) ||
        correctChoiceIndex < 0 ||
        correctChoiceIndex >= choices.length ||
        choices[correctChoiceIndex] !== answer
      ) return null;
    }
    const image = parseImageData(candidate.imageData);
    if (image === undefined) return null;
    if (image) {
      imageCount += 1;
      imageBytes += image.bytes;
      if (
        imageCount > MAX_IMAGES_PER_ACTIVITY ||
        imageBytes > MAX_ACTIVITY_IMAGE_BYTES
      ) {
        return null;
      }
    }
    const imageAlt =
      typeof candidate.imageAlt === "string"
        ? candidate.imageAlt.trim().slice(0, 160)
        : "";
    cards.push({
      id:
        typeof candidate.id === "string" && candidate.id.length <= 80
          ? candidate.id
          : randomUUID(),
      term,
      answer,
      ...(choices.length ? { choices, correctChoiceIndex } : {}),
      ...(image
        ? { imageData: image.value, imageAlt: imageAlt || term.slice(0, 160) }
        : {}),
    });
  }
  if (cards.length < 2) return null;
  return { title, subject: subject || null, mode, cards };
}

router.get("/study-activities", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const classId = Number(req.query.classId);
  const hasClassId = Number.isInteger(classId) && classId > 0;
  if (
    hasClassId &&
    !(await isClassMember(classId, userId)) &&
    !(await isClassTeacher(classId, userId))
  ) {
    res.status(403).json({ error: "Not a member of this class" });
    return;
  }
  const activities = await db
    .select()
    .from(studyActivitiesTable)
    .where(
      hasClassId
        ? eq(studyActivitiesTable.classId, classId)
        : and(
            eq(studyActivitiesTable.ownerId, userId),
            eq(studyActivitiesTable.workspaceRole, activeWorkspaceRole(userRole)),
            isNull(studyActivitiesTable.classId),
          ),
    )
    .orderBy(desc(studyActivitiesTable.updatedAt));
  res.json(activities);
});

router.get("/study-activities/shared/:token", async (req, res): Promise<void> => {
  const [activity] = await db
    .select({
      id: studyActivitiesTable.id,
      title: studyActivitiesTable.title,
      subject: studyActivitiesTable.subject,
      mode: studyActivitiesTable.mode,
      cards: studyActivitiesTable.cards,
      createdAt: studyActivitiesTable.createdAt,
      updatedAt: studyActivitiesTable.updatedAt,
    })
    .from(studyActivitiesTable)
    .where(eq(studyActivitiesTable.shareToken, req.params.token));
  if (!activity) {
    res.status(404).json({ error: "Shared activity not found" });
    return;
  }
  res.json({ ...activity, classId: null });
});

router.post(
  "/study-activities",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const classId = Number(req.body?.classId);
    const hasClassId = Number.isInteger(classId) && classId > 0;
    const requestedResourceId = positiveId(req.body?.sourceResourceId);
    const sourceActivityId = positiveId(req.body?.sourceActivityId);
    const remixedFromActivityId = positiveId(req.body?.remixedFromActivityId);
    if (
      hasClassId &&
      !(await isClassMember(classId, userId)) &&
      !(await isClassTeacher(classId, userId))
    ) {
      res.status(403).json({
        error: "Only class members can share activities with this class",
      });
      return;
    }
    const input = parseActivityInput(req.body);
    if (!input) {
      res.status(400).json({
        error: "Add a title and at least two complete cards. Images must be PNG, JPEG, or WebP and within the upload limits.",
      });
      return;
    }
    if (requestedResourceId) {
      const [resource] = await db
        .select({ id: resourcesTable.id })
        .from(resourcesTable)
        .where(eq(resourcesTable.id, requestedResourceId));
      if (!resource) {
        res.status(400).json({ error: "Source resource not found" });
        return;
      }
    }
    const [activity] = await db
      .insert(studyActivitiesTable)
      .values({
        ownerId: userId,
        workspaceRole: activeWorkspaceRole(userRole),
        classId: hasClassId ? classId : null,
        ...input,
      })
      .returning();
    const sourceResourceId =
      requestedResourceId ??
      (await resourceForSourceActivity(
        sourceActivityId ?? remixedFromActivityId,
      ));
    if (remixedFromActivityId) {
      await recordWorkflowEvent({
        userId,
        event: "activity_remixed",
        resourceId: sourceResourceId,
        activityId: activity.id,
        classId: hasClassId ? classId : null,
        context: { remixedFromActivityId },
      });
    } else if (sourceResourceId) {
      await recordWorkflowEvent({
        userId,
        event: "activity_created",
        resourceId: sourceResourceId,
        activityId: activity.id,
        classId: hasClassId ? classId : null,
        context: sourceActivityId ? { sourceActivityId } : {},
      });
    }
    if (hasClassId) {
      await recordWorkflowEvent({
        userId,
        event: "class_shared",
        resourceId: sourceResourceId,
        activityId: activity.id,
        classId,
        context: sourceActivityId ? { sourceActivityId } : {},
      });
    }
    res.status(201).json(activity);
  },
);

router.post(
  "/study-activities/:id/publish",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = req as AuthenticatedRequest;
    const id = Number(req.params.id);
    const destination = req.body?.destination === "forum" ? "forum" : "catalog";
    const [activity] = await db
      .select()
      .from(studyActivitiesTable)
      .where(eq(studyActivitiesTable.id, id));
    if (!activity || activity.ownerId !== auth.userId) {
      res.status(404).json({ error: "Study activity not found" });
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
    const shareToken = activity.shareToken ?? randomBytes(24).toString("base64url");
    if (!activity.shareToken) {
      await db.update(studyActivitiesTable)
        .set({ shareToken })
        .where(eq(studyActivitiesTable.id, activity.id));
    }
    const materialTitle = `${activity.title} (Casparel activity ${activity.id})`;
    const [existingMaterial] = await db
      .select({ id: forumMaterialsTable.id })
      .from(forumMaterialsTable)
      .where(ilike(forumMaterialsTable.title, materialTitle));
    let materialId = existingMaterial?.id;
    if (!materialId) {
      const [material] = await db.insert(forumMaterialsTable).values({
        title: materialTitle,
        description: `Interactive ${activity.mode === "all" ? "multi-mode" : activity.mode} activity with ${activity.cards.length} items.`,
        unit: activity.subject || "General",
        topic: activity.subject || activity.title,
        materialType: "activity",
        tags: ["activity", activity.mode, ...(activity.subject ? [activity.subject] : [])],
        sources: [],
        uploaderId: user.id,
        uploaderName: user.name,
        uploaderRole: auth.accountRole === "admin" ? "admin" : auth.userRole === "teacher" ? "teacher" : "student",
        linkUrl: `/activities/shared/${shareToken}`,
      }).returning({ id: forumMaterialsTable.id });
      materialId = material.id;
    }
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
          title: activity.title,
          body: `Try my ${activity.mode === "all" ? "multi-mode" : activity.mode} study activity.`,
          tags: ["activity", "shared-material"],
          attachmentMaterialId: materialId,
        });
      }
    }
    res.status(201).json({ materialId, shareToken, destination });
  },
);

router.patch(
  "/study-activities/:id",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const id = Number(req.params.id);
    const input = parseActivityInput(req.body);
    if (!Number.isInteger(id) || id <= 0 || !input) {
      res.status(400).json({ error: "Invalid study activity" });
      return;
    }
    const [existing] = await db
      .select()
      .from(studyActivitiesTable)
      .where(eq(studyActivitiesTable.id, id));
    const ownsActivity =
      existing?.ownerId === userId &&
      existing.workspaceRole === activeWorkspaceRole(userRole);
    const managesClass =
      existing?.classId != null &&
      (await isClassTeacher(existing.classId, userId));
    if (!existing || (!ownsActivity && !managesClass)) {
      res.status(404).json({ error: "Study activity not found" });
      return;
    }
    const [activity] = await db
      .update(studyActivitiesTable)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(eq(studyActivitiesTable.id, id))
      .returning();
    if (!activity) {
      res.status(404).json({ error: "Study activity not found" });
      return;
    }
    res.json(activity);
  },
);

router.delete(
  "/study-activities/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid study activity" });
      return;
    }
    const [existing] = await db
      .select()
      .from(studyActivitiesTable)
      .where(eq(studyActivitiesTable.id, id));
    const ownsActivity =
      existing?.ownerId === userId &&
      existing.workspaceRole === activeWorkspaceRole(userRole);
    const managesClass =
      existing?.classId != null &&
      (await isClassTeacher(existing.classId, userId));
    if (!existing || (!ownsActivity && !managesClass)) {
      res.status(404).json({ error: "Study activity not found" });
      return;
    }
    const removed = await db
      .delete(studyActivitiesTable)
      .where(eq(studyActivitiesTable.id, id))
      .returning({ id: studyActivitiesTable.id });
    if (!removed.length) {
      res.status(404).json({ error: "Study activity not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
