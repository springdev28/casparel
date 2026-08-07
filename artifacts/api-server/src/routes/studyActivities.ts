import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, studyActivitiesTable, type StudyActivityCard } from "@workspace/db";
import { contentLimiter } from "../lib/limiters";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";

const router: IRouter = Router();

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
  for (const item of input.cards.slice(0, 100)) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as {
      id?: unknown;
      term?: unknown;
      answer?: unknown;
    };
    const term = typeof candidate.term === "string" ? candidate.term.trim() : "";
    const answer =
      typeof candidate.answer === "string" ? candidate.answer.trim() : "";
    if (!term || !answer || term.length > 500 || answer.length > 1000) {
      return null;
    }
    cards.push({
      id:
        typeof candidate.id === "string" && candidate.id.length <= 80
          ? candidate.id
          : randomUUID(),
      term,
      answer,
    });
  }
  if (cards.length < 2) return null;
  return { title, subject: subject || null, cards };
}

router.get("/study-activities", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const activities = await db
    .select()
    .from(studyActivitiesTable)
    .where(
      and(
        eq(studyActivitiesTable.ownerId, userId),
        eq(studyActivitiesTable.workspaceRole, activeWorkspaceRole(userRole)),
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
    const input = parseActivityInput(req.body);
    if (!input) {
      res.status(400).json({
        error: "Add a title and at least two complete term-and-answer pairs",
      });
      return;
    }
    const [activity] = await db
      .insert(studyActivitiesTable)
      .values({
        ownerId: userId,
        workspaceRole: activeWorkspaceRole(userRole),
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
    const [activity] = await db
      .update(studyActivitiesTable)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(studyActivitiesTable.id, id),
          eq(studyActivitiesTable.ownerId, userId),
          eq(studyActivitiesTable.workspaceRole, activeWorkspaceRole(userRole)),
        ),
      )
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
    const removed = await db
      .delete(studyActivitiesTable)
      .where(
        and(
          eq(studyActivitiesTable.id, id),
          eq(studyActivitiesTable.ownerId, userId),
          eq(studyActivitiesTable.workspaceRole, activeWorkspaceRole(userRole)),
        ),
      )
      .returning({ id: studyActivitiesTable.id });
    if (!removed.length) {
      res.status(404).json({ error: "Study activity not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
