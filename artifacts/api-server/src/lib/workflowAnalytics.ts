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
import { logger } from "./logger";

type WorkflowEventInput = {
  userId: number;
  event: WorkflowEventType;
  resourceId?: number | null;
  activityId?: number | null;
  classId?: number | null;
  assignmentId?: number | null;
  context?: Record<string, string | number | boolean | null>;
  oncePerDay?: boolean;
  onceEver?: boolean;
};

export function optionalWorkflowUserId(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return decodeToken(header.slice(7))?.userId ?? null;
}

export async function recordWorkflowEvent(input: WorkflowEventInput) {
  if (process.env.NODE_ENV === "test") return;

  // Analytics context is deliberately low-cardinality and bounded. Route code
  // must never put names, email, search text, URLs, or student writing here;
  // truncation is a second containment layer, not permission to send PII.
  const context = Object.fromEntries(
    Object.entries(input.context ?? {})
      .slice(0, 16)
      .map(([key, value]) => [
        key.slice(0, 48),
        typeof value === "string" ? value.slice(0, 120) : value,
      ]),
  );

  try {
    if (input.oncePerDay || input.onceEver) {
      // This read-before-write is a product-noise guard, not financial-grade
      // uniqueness: concurrent requests can still race. Events requiring exact
      // once-only semantics need a database unique key and conflict handling.
      const conditions = [
        eq(workflowEventsTable.userId, input.userId),
        eq(workflowEventsTable.event, input.event),
      ];
      if (input.oncePerDay) {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        conditions.push(
          gte(workflowEventsTable.createdAt, startOfDay.toISOString()),
        );
      }
      if (input.resourceId && !input.onceEver) {
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
      context,
    });
  } catch (error) {
    // Telemetry is best-effort. A metrics outage must not fail the learning
    // action whose success the event was intended to observe.
    logger.warn(
      { err: error, event: input.event, userId: input.userId },
      "Workflow analytics write failed",
    );
  }
}
