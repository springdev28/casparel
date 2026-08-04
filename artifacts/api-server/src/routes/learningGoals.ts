import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, learningGoalsTable } from "@workspace/db";
import { CreateLearningGoalBody, CreateLearningGoalResponse, DeleteLearningGoalParams, ListLearningGoalsResponse, UpdateLearningGoalBody, UpdateLearningGoalParams, UpdateLearningGoalResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";

const router: IRouter = Router();
function dateString(value: Date | string | null | undefined): string | null | undefined {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

router.get("/learning-goals", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const goals = await db.select().from(learningGoalsTable).where(eq(learningGoalsTable.userId, userId)).orderBy(desc(learningGoalsTable.updatedAt));
  res.json(ListLearningGoalsResponse.parse(goals));
});

router.post("/learning-goals", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const createInput = req.body && typeof req.body.targetDate === "string" ? { ...req.body, targetDate: new Date(req.body.targetDate + "T00:00:00Z") } : req.body;
  const body = CreateLearningGoalBody.safeParse(createInput);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [goal] = await db.insert(learningGoalsTable).values({ ...body.data, targetDate: dateString(body.data.targetDate), userId, preferredFormats: body.data.preferredFormats ?? null }).returning();
  res.status(201).json(CreateLearningGoalResponse.parse(goal));
});

router.patch("/learning-goals/:id", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateLearningGoalParams.safeParse(req.params);
  const patchInput = req.body && typeof req.body.targetDate === "string" ? { ...req.body, targetDate: new Date(req.body.targetDate + "T00:00:00Z") } : req.body;
  const body = UpdateLearningGoalBody.safeParse(patchInput);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid learning goal update" }); return; }
  const [goal] = await db.update(learningGoalsTable).set({ ...body.data, targetDate: dateString(body.data.targetDate), updatedAt: new Date().toISOString() }).where(and(eq(learningGoalsTable.id, params.data.id), eq(learningGoalsTable.userId, userId))).returning();
  if (!goal) { res.status(404).json({ error: "Learning goal not found" }); return; }
  res.json(UpdateLearningGoalResponse.parse(goal));
});

router.delete("/learning-goals/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteLearningGoalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const removed = await db.delete(learningGoalsTable).where(and(eq(learningGoalsTable.id, params.data.id), eq(learningGoalsTable.userId, userId))).returning({ id: learningGoalsTable.id });
  if (!removed.length) { res.status(404).json({ error: "Learning goal not found" }); return; }
  res.sendStatus(204);
});

export default router;
