import { Router, type IRouter } from "express";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import {
  db,
  studySessionsTable,
  studySessionParticipantsTable,
  usersTable,
  classMembersTable,
  resourcesTable,
  userBlocksTable,
  activityLogTable,
} from "@workspace/db";

/** Reject any meeting URL that isn't http or https — blocks javascript: etc. */
function isSafeMeetingUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Return true if the resource exists (resources are publicly accessible). */
async function resourceExists(resourceId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: resourcesTable.id })
    .from(resourcesTable)
    .where(eq(resourcesTable.id, resourceId));
  return row !== undefined;
}
import {
  CreateStudySessionBody,
  CreateStudySessionResponse,
  ListStudySessionsResponse,
  GetStudySessionParams,
  GetStudySessionResponse,
  UpdateStudySessionParams,
  UpdateStudySessionBody,
  UpdateStudySessionResponse,
  DeleteStudySessionParams,
  RsvpStudySessionParams,
  RsvpStudySessionBody,
  RsvpStudySessionResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { syncSessionToGCal, deleteSessionFromGCal } from "./calendar";

const router: IRouter = Router();

/** Fetch a session with participant details. Returns null if not found. */
async function getSessionWithParticipants(sessionId: number, viewerUserId: number) {
  const [session] = await db
    .select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.id, sessionId));
  if (!session) return null;

  const rawParticipants = await db
    .select({
      userId: studySessionParticipantsTable.userId,
      status: studySessionParticipantsTable.status,
      respondedAt: studySessionParticipantsTable.respondedAt,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(studySessionParticipantsTable)
    .leftJoin(usersTable, eq(studySessionParticipantsTable.userId, usersTable.id))
    .where(eq(studySessionParticipantsTable.sessionId, sessionId));

  const myParticipant = rawParticipants.find((p) => p.userId === viewerUserId);
  const myStatus =
    session.organizerId === viewerUserId
      ? "accepted"
      : (myParticipant?.status ?? null);

  return {
    ...session,
    participants: rawParticipants,
    myStatus,
  };
}

// GET /study-sessions — sessions where user is organiser or participant
router.get("/study-sessions", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  // Find session IDs where user is a participant
  const participantRows = await db
    .select({ sessionId: studySessionParticipantsTable.sessionId })
    .from(studySessionParticipantsTable)
    .where(eq(studySessionParticipantsTable.userId, userId));

  const participantSessionIds = participantRows.map((r) => r.sessionId);

  // Fetch sessions organised by user OR where user is invited
  const sessions = await db
    .select()
    .from(studySessionsTable)
    .where(
      participantSessionIds.length > 0
        ? or(
            eq(studySessionsTable.organizerId, userId),
            inArray(studySessionsTable.id, participantSessionIds),
          )
        : eq(studySessionsTable.organizerId, userId),
    )
    .orderBy(studySessionsTable.startsAt);

  // Enrich each session with participants
  const enriched = await Promise.all(
    sessions.map((s) => getSessionWithParticipants(s.id, userId)),
  );

  res.json(ListStudySessionsResponse.parse(enriched.filter(Boolean)));
});

// POST /study-sessions — create and auto-invite participants
router.post(
  "/study-sessions",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const parsed = CreateStudySessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { inviteeIds, ...sessionData } = parsed.data;

    // Validate meeting URL scheme before storing
    if (!isSafeMeetingUrl(sessionData.meetingUrl)) {
      res.status(400).json({ error: "Meeting URL must start with https:// or http://" });
      return;
    }

    // Validate resourceId exists if provided
    if (sessionData.resourceId !== undefined && sessionData.resourceId !== null) {
      if (!(await resourceExists(sessionData.resourceId))) {
        res.status(400).json({ error: "Linked resource not found" });
        return;
      }
    }

    // Validate that every requested invitee shares at least one class with the organiser
    const uniqueInvitees = [...new Set((inviteeIds ?? []).filter((id) => id !== userId))];
    if (uniqueInvitees.length > 0) {
      const blockedRelationships = await db.select({ id: userBlocksTable.id }).from(userBlocksTable).where(or(
        and(eq(userBlocksTable.blockerId, userId), inArray(userBlocksTable.blockedId, uniqueInvitees)),
        and(inArray(userBlocksTable.blockerId, uniqueInvitees), eq(userBlocksTable.blockedId, userId)),
      ));
      if (blockedRelationships.length > 0) {
        res.status(403).json({ error: "One or more invitees cannot be invited due to a safety preference" });
        return;
      }

      const discoverableRows = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(inArray(usersTable.id, uniqueInvitees), eq(usersTable.profileVisibility, "everyone")));
      const discoverableIds = new Set(discoverableRows.map((row) => row.id));

      // Classes the organiser belongs to
      const myClasses = await db
        .select({ classId: classMembersTable.classId })
        .from(classMembersTable)
        .where(eq(classMembersTable.userId, userId));
      const myClassIds = myClasses.map((r) => r.classId);

      if (myClassIds.length > 0) {
        // Users who share one of those classes
        const sharedRows = await db
          .selectDistinct({ userId: classMembersTable.userId })
          .from(classMembersTable)
          .where(
            and(
              inArray(classMembersTable.classId, myClassIds),
              inArray(classMembersTable.userId, uniqueInvitees),
            ),
          );
        const allowedIds = new Set(sharedRows.map((r) => r.userId));
        const forbidden = uniqueInvitees.filter((id) => !allowedIds.has(id) && !discoverableIds.has(id));
        if (forbidden.length > 0) {
          res.status(403).json({
            error: "One or more invitees are not available to invite",
          });
          return;
        }
      } else {
        const forbidden = uniqueInvitees.filter((id) => !discoverableIds.has(id));
        if (forbidden.length > 0) {
          res.status(403).json({ error: "One or more invitees are not available to invite" });
          return;
        }
      }
    }

    const [session] = await db
      .insert(studySessionsTable)
      .values({ ...sessionData, organizerId: userId })
      .returning();

    if (uniqueInvitees.length > 0) {
      await db.insert(studySessionParticipantsTable).values(
        uniqueInvitees.map((inviteeId) => ({
          sessionId: session.id,
          userId: inviteeId,
          status: "pending" as const,
        })),
      );
      await db.insert(activityLogTable).values(
        uniqueInvitees.map((inviteeId) => ({
          userId: inviteeId,
          type: "schedule" as const,
          workspaceRole: "student" as const,
          message: `You were invited to "${session.title}" on ${new Date(session.startsAt).toLocaleString()}`,
        })),
      );
    }

    const result = await getSessionWithParticipants(session.id, userId);
    res.status(201).json(CreateStudySessionResponse.parse(result));
    // Fire-and-forget GCal sync (non-blocking)
    syncSessionToGCal(userId, session.id, session).catch(() => {});
  },
);

// GET /study-sessions/:id
router.get("/study-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = GetStudySessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const result = await getSessionWithParticipants(parsed.data.id, userId);
  if (!result) {
    res.status(404).json({ error: "Study session not found" });
    return;
  }

  // Only organiser and participants can view
  const isOrganiser = result.organizerId === userId;
  const isParticipant = result.participants.some((p) => p.userId === userId);
  if (!isOrganiser && !isParticipant) {
    res.status(403).json({ error: "Not a participant or organiser" });
    return;
  }

  res.json(GetStudySessionResponse.parse(result));
});

// PATCH /study-sessions/:id — organiser edits
router.patch("/study-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateStudySessionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Study session not found" });
    return;
  }
  if (session.organizerId !== userId) {
    res.status(403).json({ error: "Only the organiser can edit this session" });
    return;
  }

  const parsed = UpdateStudySessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Validate meeting URL scheme if provided
  if (parsed.data.meetingUrl !== undefined && parsed.data.meetingUrl !== null) {
    if (!isSafeMeetingUrl(parsed.data.meetingUrl)) {
      res.status(400).json({ error: "Meeting URL must start with https:// or http://" });
      return;
    }
  }

  // Validate resourceId exists if provided
  if (parsed.data.resourceId !== undefined && parsed.data.resourceId !== null) {
    if (!(await resourceExists(parsed.data.resourceId))) {
      res.status(400).json({ error: "Linked resource not found" });
      return;
    }
  }

  await db
    .update(studySessionsTable)
    .set(parsed.data)
    .where(eq(studySessionsTable.id, params.data.id));

  const result = await getSessionWithParticipants(params.data.id, userId);
  res.json(UpdateStudySessionResponse.parse(result));
  // Fire-and-forget GCal sync (non-blocking)
  if (result) syncSessionToGCal(userId, params.data.id, result).catch(() => {});
});

// DELETE /study-sessions/:id — organiser cancels
router.delete("/study-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = DeleteStudySessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.id, parsed.data.id));
  if (!session) {
    res.status(404).json({ error: "Study session not found" });
    return;
  }
  if (session.organizerId !== userId) {
    res.status(403).json({ error: "Only the organiser can cancel this session" });
    return;
  }

  // `session` (fetched above) already has the Google Calendar event ID —
  // pass it to the helper before deleting the row to avoid a read-after-delete race.
  await db
    .delete(studySessionsTable)
    .where(eq(studySessionsTable.id, parsed.data.id));

  res.status(204).end();
  // Fire-and-forget GCal deletion with the pre-fetched event ID (non-blocking)
  deleteSessionFromGCal(userId, parsed.data.id, session.googleCalendarEventId).catch(() => {});
});

// PATCH /study-sessions/:id/rsvp — participant accepts/declines
router.patch(
  "/study-sessions/:id/rsvp",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const params = RsvpStudySessionParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }

    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(eq(studySessionsTable.id, params.data.id));
    if (!session) {
      res.status(404).json({ error: "Study session not found" });
      return;
    }

    // Check user is a participant (not organiser)
    const [participant] = await db
      .select()
      .from(studySessionParticipantsTable)
      .where(
        and(
          eq(studySessionParticipantsTable.sessionId, params.data.id),
          eq(studySessionParticipantsTable.userId, userId),
        ),
      );
    if (!participant) {
      res.status(403).json({ error: "You are not invited to this session" });
      return;
    }

    const parsed = RsvpStudySessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    await db
      .update(studySessionParticipantsTable)
      .set({
        status: parsed.data.status,
        respondedAt: sql`now()`,
      })
      .where(
        and(
          eq(studySessionParticipantsTable.sessionId, params.data.id),
          eq(studySessionParticipantsTable.userId, userId),
        ),
      );

    const result = await getSessionWithParticipants(params.data.id, userId);
    res.json(RsvpStudySessionResponse.parse(result));
  },
);

export default router;
