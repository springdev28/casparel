import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, studyActivitiesTable, type StudyActivityCard } from "@workspace/db";
import { contentLimiter } from "../lib/limiters";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { isClassMember, isClassTeacher } from "../lib/authz";

const router: IRouter = Router();
const IMAGE_DATA_PATTERN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_IMAGE_BYTES = 140 * 1024;
const MAX_IMAGES_PER_ACTIVITY = 6;
const MAX_ACTIVITY_IMAGE_BYTES = 700 * 1024;

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

function parseActivityInput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as {
    title?: unknown;
    subject?: unknown;
    cards?: unknown;
  };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const subject =
    typeof input.subject === "string" ? input.subject.trim() : "";
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
      imageData?: unknown;
      imageAlt?: unknown;
    };
    const term = typeof candidate.term === "string" ? candidate.term.trim() : "";
    const answer =
      typeof candidate.answer === "string" ? candidate.answer.trim() : "";
    if (!term || !answer || term.length > 500 || answer.length > 1000) {
      return null;
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
      ...(image
        ? { imageData: image.value, imageAlt: imageAlt || term.slice(0, 160) }
        : {}),
    });
  }
  if (cards.length < 2) return null;
  return { title, subject: subject || null, cards };
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

router.post(
  "/study-activities",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, userRole } = req as AuthenticatedRequest;
    const classId = Number(req.body?.classId);
    const hasClassId = Number.isInteger(classId) && classId > 0;
    if (hasClassId && !(await isClassTeacher(classId, userId))) {
      res.status(403).json({
        error: "Only the class teacher can create class activities",
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
    const [activity] = await db
      .insert(studyActivitiesTable)
      .values({
        ownerId: userId,
        workspaceRole: activeWorkspaceRole(userRole),
        classId: hasClassId ? classId : null,
        ...input,
      })
      .returning();
    res.status(201).json(activity);
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
