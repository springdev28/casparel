/**
 * @fileOverview Backend domain role: centralizes Workflow Analytics logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import type { Request } from "express";
import { and, eq, gte } from "drizzle-orm";
import {
  db,
  workflowEventsTable,
  type WorkflowEventType,
} from "@workspace/db";
import { decodeToken } from "./auth";

type WorkflowEventInput = {
  userId: number;
  event: WorkflowEventType;
  resourceId?: number | null;
  activityId?: number | null;
  classId?: number | null;
  assignmentId?: number | null;
  context?: Record<string, string | number | boolean | null>;
  oncePerDay?: boolean;
};

export function optionalWorkflowUserId(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return decodeToken(header.slice(7))?.userId ?? null;
}

export async function recordWorkflowEvent(input: WorkflowEventInput) {
  if (process.env.NODE_ENV === "test") return;

  if (input.oncePerDay) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const conditions = [
      eq(workflowEventsTable.userId, input.userId),
      eq(workflowEventsTable.event, input.event),
      gte(workflowEventsTable.createdAt, startOfDay.toISOString()),
    ];
    if (input.resourceId) {
      conditions.push(eq(workflowEventsTable.resourceId, input.resourceId));
    }
    const [existing] = await db
      .select({ id: workflowEventsTable.id })
      .from(workflowEventsTable)
      .where(and(...conditions))
      .limit(1);
    if (existing) return;
  }

  await db.insert(workflowEventsTable).values({
    userId: input.userId,
    event: input.event,
    resourceId: input.resourceId ?? null,
    activityId: input.activityId ?? null,
    classId: input.classId ?? null,
    assignmentId: input.assignmentId ?? null,
    context: input.context ?? {},
  });
}

/**
 * Several milestones at once, in one statement.
 *
 * Building a goal path from a Learning List is one action by the learner that
 * is genuinely several of these -- every resource in the list reached a path,
 * which is the same thing attaching them one at a time records. Writing them
 * one insert at a time would put the length of somebody's list into the
 * latency of the button they just pressed.
 *
 * No `oncePerDay` here: that is a read-then-write per event and belongs to the
 * single-event path. Callers that need it should use recordWorkflowEvent.
 */
export async function recordWorkflowEvents(
  inputs: Array<Omit<WorkflowEventInput, "oncePerDay">>,
) {
  if (process.env.NODE_ENV === "test" || inputs.length === 0) return;
  await db.insert(workflowEventsTable).values(
    inputs.map((input) => ({
      userId: input.userId,
      event: input.event,
      resourceId: input.resourceId ?? null,
      activityId: input.activityId ?? null,
      classId: input.classId ?? null,
      assignmentId: input.assignmentId ?? null,
      context: input.context ?? {},
    })),
  );
}
