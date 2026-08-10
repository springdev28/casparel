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
