import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, scheduleBlocksTable } from "@workspace/db";
import {
  ListScheduleBlocksQueryParams,
  ListScheduleBlocksResponse,
  CreateScheduleBlockBody,
  CreateScheduleBlockResponse,
  UpdateScheduleBlockParams,
  UpdateScheduleBlockBody,
  UpdateScheduleBlockResponse,
  DeleteScheduleBlockParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { isScheduleBlockOwner } from "../lib/authz";

const router: IRouter = Router();

function dateToString(d: Date | string | undefined): string | undefined {
  if (d === undefined) return undefined;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return d as string;
}

// GET /schedule — own blocks only; optional weekStart (YYYY-MM-DD) filters to that Mon-Sun
router.get("/schedule", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  // Validate query params (weekStart coerces to Date via orval config)
  const qParsed = ListScheduleBlocksQueryParams.safeParse(req.query);
  if (!qParsed.success) {
    res.status(400).json({ error: qParsed.error.message });
    return;
  }

  const { weekStart } = qParsed.data;

  if (weekStart) {
    // weekStart is coerced to Date by orval; convert to YYYY-MM-DD string
    const startStr = dateToString(weekStart)!;
    // End of the 7-day window (Sunday = start + 6 days)
    const startDate = new Date(startStr + "T00:00:00Z");
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const endStr = endDate.toISOString().slice(0, 10);

    const rows = await db
      .select()
      .from(scheduleBlocksTable)
      .where(
        and(
          eq(scheduleBlocksTable.userId, userId),
          gte(scheduleBlocksTable.date, startStr),
          lte(scheduleBlocksTable.date, endStr),
        ),
      );
    res.json(ListScheduleBlocksResponse.parse(rows));
    return;
  }

  // No weekStart — return all blocks for the user
  const rows = await db
    .select()
    .from(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.userId, userId));
  res.json(ListScheduleBlocksResponse.parse(rows));
});

// POST /schedule — any authenticated user; owner always set to self
router.post("/schedule", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = CreateScheduleBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date, ...rest } = parsed.data;
  const dateStr = dateToString(date)!;
  const [block] = await db
    .insert(scheduleBlocksTable)
    .values({ ...rest, date: dateStr, userId })
    .returning();
  res.status(201).json(CreateScheduleBlockResponse.parse(block));
});

// PATCH /schedule/:id — owner only
router.patch("/schedule/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateScheduleBlockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isScheduleBlockOwner(params.data.id, userId))) {
    res.status(403).json({ error: "Only the owner can update this schedule block" });
    return;
  }
  const parsed = UpdateScheduleBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date: rawDate, title, startTime, endTime, notes } = parsed.data;
  const patchData: {
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    notes?: string;
  } = {};
  if (title !== undefined) patchData.title = title;
  if (rawDate !== undefined) patchData.date = dateToString(rawDate)!;
  if (startTime !== undefined) patchData.startTime = startTime;
  if (endTime !== undefined) patchData.endTime = endTime;
  if (notes !== undefined) patchData.notes = notes;

  const [block] = await db
    .update(scheduleBlocksTable)
    .set(patchData)
    .where(eq(scheduleBlocksTable.id, params.data.id))
    .returning();
  if (!block) {
    res.status(404).json({ error: "Schedule block not found" });
    return;
  }
  res.json(UpdateScheduleBlockResponse.parse(block));
});

// DELETE /schedule/:id — owner only
router.delete("/schedule/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteScheduleBlockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isScheduleBlockOwner(params.data.id, userId))) {
    res.status(403).json({ error: "Only the owner can delete this schedule block" });
    return;
  }
  await db.delete(scheduleBlocksTable).where(eq(scheduleBlocksTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
