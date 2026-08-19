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

const router: IRouter = Router();

function dateToString(d: Date | string | undefined): string | undefined {
  if (d === undefined) return undefined;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return d as string;
}

/**
 * A block as the contract says it looks, with `date` a plain YYYY-MM-DD.
 *
 * The OpenAPI schema declares `date: { type: string, format: date }`, and
 * orval turns that into `zod.coerce.date()` -- so parsing a row through the
 * generated response schema replaces the database's "2026-08-19" with a JS
 * Date, and res.json then serialises it as "2026-08-19T00:00:00.000Z". The
 * server was breaking its own contract on the way out.
 *
 * The mobile schedule believed the contract and compared `block.date` to a
 * YYYY-MM-DD string for the selected day. That comparison could never be true,
 * so schedule blocks were invisible on the phone -- in every timezone, on
 * every day, for everybody. The web app happens to parse the value into a Date
 * before comparing, which is why it looked fine there.
 *
 * The generated schema is not ours to edit, so the shape is restored here,
 * once, at the boundary where the response is written.
 */
function asContract<T extends { date: Date | string }>(block: T): T & { date: string } {
  return { ...block, date: dateToString(block.date)! };
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
  const dateStr = dateToString(date)!;
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
  if (rawDate !== undefined) patchData.date = dateToString(rawDate)!;
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
