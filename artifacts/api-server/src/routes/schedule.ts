/**
 * @fileOverview API role: implements the Schedule HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
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
import { contentLimiter } from "../lib/limiters";
import { isScheduleBlockOwner } from "../lib/authz";
import { syncBlockToGCal, deleteBlockFromGCal } from "./calendar";
import { validationMessage } from "../lib/validationMessage";
import { dateOnly } from "../lib/contractDates";

const router: IRouter = Router();

/**
 * A block as the contract says it looks, with `date` a plain YYYY-MM-DD.
 *
 * Why this is needed at all, and what it cost when it was missing, is in
 * lib/contractDates.ts. The short version: the contract calls this field a
 * date, the generated response schema coerces it to a Date, and res.json
 * writes an instant -- which made every schedule block invisible on every
 * phone. Learning goals had the same defect, which is why the repair now lives
 * in one place instead of this file.
 */
function asContract<T extends { date: Date | string }>(block: T): T & { date: string } {
  return { ...block, date: dateOnly(block.date) };
}

// GET /schedule, own blocks only; optional weekStart (YYYY-MM-DD) filters to that Mon-Sun
router.get("/schedule", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  // Validate query params (weekStart coerces to Date via orval config)
  const rawWeekStart = typeof req.query.weekStart === "string" ? new Date(req.query.weekStart + "T00:00:00Z") : req.query.weekStart;
  const qParsed = ListScheduleBlocksQueryParams.safeParse({ ...req.query, weekStart: rawWeekStart });
  if (!qParsed.success) {
    res.status(400).json({ error: validationMessage(qParsed.error) });
    return;
  }

  const { weekStart } = qParsed.data;

  if (weekStart) {
    // weekStart is coerced to Date by orval; convert to YYYY-MM-DD string
    const startStr = dateOnly(weekStart)!;
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
    res.json(ListScheduleBlocksResponse.parse(rows).map(asContract));
    return;
  }

  // No weekStart, return all blocks for the user
  const rows = await db
    .select()
    .from(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.userId, userId));
  res.json(ListScheduleBlocksResponse.parse(rows).map(asContract));
});

// POST /schedule, any authenticated user; owner always set to self
router.post("/schedule", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = CreateScheduleBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const { date, ...rest } = parsed.data;
  const dateStr = dateOnly(date)!;
  const [block] = await db
    .insert(scheduleBlocksTable)
    .values({ ...rest, date: dateStr, userId })
    .returning();
  res.status(201).json(asContract(CreateScheduleBlockResponse.parse(block)));
  // Fire-and-forget Google Calendar sync (non-blocking)
  syncBlockToGCal(userId, block.id, block).catch(() => {});
});

// PATCH /schedule/:id, owner only
router.patch("/schedule/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateScheduleBlockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isScheduleBlockOwner(params.data.id, userId))) {
    res.status(403).json({ error: "Only the owner can update this schedule block" });
    return;
  }
  const parsed = UpdateScheduleBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const { date: rawDate, title, startTime, endTime, notes, resourceId, listId } = parsed.data;
  const patchData: {
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    notes?: string;
    resourceId?: number | null;
    listId?: number | null;
  } = {};
  if (title !== undefined) patchData.title = title;
  if (rawDate !== undefined) patchData.date = dateOnly(rawDate)!;
  if (startTime !== undefined) patchData.startTime = startTime;
  if (endTime !== undefined) patchData.endTime = endTime;
  if (notes !== undefined) patchData.notes = notes;
  if (resourceId !== undefined) patchData.resourceId = resourceId;
  if (listId !== undefined) patchData.listId = listId;

  const [block] = await db
    .update(scheduleBlocksTable)
    .set(patchData)
    .where(eq(scheduleBlocksTable.id, params.data.id))
    .returning();
  if (!block) {
    res.status(404).json({ error: "Schedule block not found" });
    return;
  }
  res.json(asContract(UpdateScheduleBlockResponse.parse(block)));
  // Fire-and-forget Google Calendar sync (non-blocking)
  syncBlockToGCal(userId, block.id, block).catch(() => {});
});

// DELETE /schedule/:id, owner only
router.delete("/schedule/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteScheduleBlockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  if (!(await isScheduleBlockOwner(params.data.id, userId))) {
    res.status(403).json({ error: "Only the owner can delete this schedule block" });
    return;
  }
  // Read the Google Calendar event ID before deleting the row to avoid a
  // read-after-delete race in the GCal helper.
  const [blockToDelete] = await db
    .select({ gcId: scheduleBlocksTable.googleCalendarEventId })
    .from(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.id, params.data.id));
  await db.delete(scheduleBlocksTable).where(eq(scheduleBlocksTable.id, params.data.id));
  res.sendStatus(204);
  // Fire-and-forget with the pre-fetched GCal event ID (non-blocking)
  deleteBlockFromGCal(userId, params.data.id, blockToDelete?.gcId).catch(() => {});
});

export default router;
