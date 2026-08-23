/**
 * @fileOverview API role: implements the Calendar HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
/**
 * Calendar integration routes.
 *
 * Google Calendar OAuth:
 *  1. User clicks "Connect" → GET /calendar/google/connect (returns auth URL)
 *  2. Frontend redirects browser to the returned URL
 *  3. Google redirects → GET /calendar/google/callback
 *  4. Server stores tokens in calendar_tokens → redirects to /profile?cal_connected=1
 *
 * iCal feed:
 *  GET /calendar/:icalSecret/feed.ics , no auth header; secret in URL
 *
 * One-off .ics export:
 *  GET /schedule/:blockId/export.ics  , auth required
 *  GET /study-sessions/:sessionId/export.ics, auth required
 */
import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq, and, or, inArray } from "drizzle-orm";
import {
  db,
  calendarTokensTable,
  scheduleBlocksTable,
  studySessionsTable,
  studySessionParticipantsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ── Config ────────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const SECRET = process.env.SESSION_SECRET ?? "";
const GOOGLE_CAL_REDIRECT_URI_OVERRIDE = process.env.GOOGLE_CAL_REDIRECT_URI ?? "";

const CAL_CONFIGURED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

const CAL_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
  "profile",
].join(" ");

// ── CSRF state helpers ────────────────────────────────────────────────────────

function makeState(userId: number): string {
  const ts = Date.now().toString();
  const payload = `${userId}:${ts}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyState(state: string): number | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    const colonIdx = decoded.lastIndexOf(":");
    if (colonIdx < 0) return null;
    const sigHex = decoded.slice(colonIdx + 1);
    const payload = decoded.slice(0, colonIdx);
    const parts = payload.split(":");
    if (parts.length !== 2) return null;
    const [userIdStr, ts] = parts;
    const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
    if (
      sigHex.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sigHex, "hex"), Buffer.from(expected, "hex"))
    ) {
      return null;
    }
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return Number(userIdStr);
  } catch {
    return null;
  }
}

// ── Token refresh helper ──────────────────────────────────────────────────────

async function getValidCalToken(userId: number): Promise<string | null> {
  const [row] = await db
    .select()
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.userId, userId));

  if (!row?.googleAccessToken) return null;

  if (
    row.googleTokenExpiry &&
    new Date(row.googleTokenExpiry).getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return row.googleAccessToken;
  }

  if (!row.googleRefreshToken) {
    await db
      .update(calendarTokensTable)
      .set({ googleAccessToken: null, googleRefreshToken: null, googleTokenExpiry: null })
      .where(eq(calendarTokensTable.userId, userId));
    return null;
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: row.googleRefreshToken,
    grant_type: "refresh_token",
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    await db
      .update(calendarTokensTable)
      .set({ googleAccessToken: null, googleRefreshToken: null, googleTokenExpiry: null })
      .where(eq(calendarTokensTable.userId, userId));
    return null;
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await db
    .update(calendarTokensTable)
    .set({
      googleAccessToken: data.access_token,
      googleTokenExpiry: expiry,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(calendarTokensTable.userId, userId));

  return data.access_token;
}

// ── Ensure the user has a calendar token row (creates icalSecret if needed) ──

/**
 * The account's calendar row, made if it is not there yet.
 *
 * This used to read, then insert if the read found nothing, and `user_id` is
 * unique -- so two requests arriving together both found nothing and both
 * inserted, and the loser got `duplicate key value violates unique constraint
 * "calendar_tokens_user_id_key"` as a 500.
 *
 * Two requests arriving together is the normal case, not a rare one. The row
 * is created on first read, every screen that mentions the calendar asks for
 * it on mount, and a phone app mounts several screens at once while a tab bar
 * settles. So it landed on the first visit of a brand-new account, which is
 * the worst possible audience for a 500, and never again afterwards -- which
 * is why it looked like a fluke.
 *
 * Postgres decides instead: the insert either wins or is ignored, and the
 * secret is whatever ended up in the table.
 */
async function ensureCalendarTokenRow(userId: number): Promise<string> {
  const [existing] = await db
    .select({ icalSecret: calendarTokensTable.icalSecret })
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.userId, userId));

  if (existing) return existing.icalSecret;

  const [inserted] = await db
    .insert(calendarTokensTable)
    .values({ userId, icalSecret: crypto.randomUUID() })
    .onConflictDoNothing({ target: calendarTokensTable.userId })
    .returning({ icalSecret: calendarTokensTable.icalSecret });

  if (inserted) return inserted.icalSecret;

  // Someone else got there in between. Their secret is the account's secret;
  // handing back the one that was not stored would sign iCal URLs nothing can
  // verify.
  const [winner] = await db
    .select({ icalSecret: calendarTokensTable.icalSecret })
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.userId, userId));
  if (!winner) throw new Error("calendar token row vanished after an insert conflict");
  return winner.icalSecret;
}

// ── iCal helpers ──────────────────────────────────────────────────────────────

function escapeIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (i === 0) {
      chunks.push(line.slice(0, 75));
      i = 75;
    } else {
      chunks.push(" " + line.slice(i, i + 74));
      i += 74;
    }
  }
  return chunks.join("\r\n");
}

function toIcalDate(isoString: string): string {
  // Convert ISO string to iCal UTC format: 20260801T140000Z
  const d = new Date(isoString);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0") +
    "T" +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") +
    String(d.getUTCSeconds()).padStart(2, "0") +
    "Z"
  );
}

/** Convert a schedule block date + time string to ISO datetime */
function blockDateTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: string; // ISO
  dtend: string; // ISO
  description?: string;
  location?: string;
  createdAt?: string;
}

function renderIcalEvent(e: ICalEvent): string {
  const lines: string[] = [
    "BEGIN:VEVENT",
    foldLine(`UID:${e.uid}`),
    foldLine(`SUMMARY:${escapeIcal(e.summary)}`),
    `DTSTART:${toIcalDate(e.dtstart)}`,
    `DTEND:${toIcalDate(e.dtend)}`,
    `DTSTAMP:${toIcalDate(new Date().toISOString())}`,
  ];
  if (e.description) lines.push(foldLine(`DESCRIPTION:${escapeIcal(e.description)}`));
  if (e.location) lines.push(foldLine(`LOCATION:${escapeIcal(e.location)}`));
  if (e.createdAt) lines.push(`CREATED:${toIcalDate(e.createdAt)}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

function renderIcalFeed(events: ICalEvent[], calName: string): string {
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // The product's name, which is what a calendar app shows when it says
    // where a feed came from.
    "PRODID:-//Casparel//Casparel Calendar//EN",
    `X-WR-CALNAME:${escapeIcal(calName)}`,
    "X-WR-TIMEZONE:UTC",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ].join("\r\n");

  const body = events.map(renderIcalEvent).join("\r\n");
  const footer = "END:VCALENDAR";

  return [header, body, footer].filter(Boolean).join("\r\n") + "\r\n";
}

// ── Google Calendar API helper ────────────────────────────────────────────────

interface GCalEventInput {
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
}

async function createGCalEvent(token: string, event: GCalEventInput): Promise<string | null> {
  const body = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: { dateTime: event.startIso, timeZone: "UTC" },
    end: { dateTime: event.endIso, timeZone: "UTC" },
  };

  const resp = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!resp.ok) return null;
  const data = (await resp.json()) as { id: string };
  return data.id ?? null;
}

async function updateGCalEvent(token: string, gcEventId: string, event: GCalEventInput): Promise<void> {
  const body = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: { dateTime: event.startIso, timeZone: "UTC" },
    end: { dateTime: event.endIso, timeZone: "UTC" },
  };

  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gcEventId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

async function deleteGCalEvent(token: string, gcEventId: string): Promise<void> {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gcEventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

// ── Exported sync helpers (called from schedule/studySessions routes) ─────────

export async function syncBlockToGCal(
  userId: number,
  blockId: number,
  block: { title: string; date: string; startTime: string; endTime: string; notes?: string | null },
): Promise<void> {
  const token = await getValidCalToken(userId);
  if (!token) return;

  const startIso = blockDateTimeToIso(block.date, block.startTime);
  const endIso = blockDateTimeToIso(block.date, block.endTime);
  const event: GCalEventInput = {
    summary: block.title,
    description: block.notes ?? undefined,
    startIso,
    endIso,
  };

  const [existing] = await db
    .select({ gcId: scheduleBlocksTable.googleCalendarEventId })
    .from(scheduleBlocksTable)
    .where(and(eq(scheduleBlocksTable.id, blockId), eq(scheduleBlocksTable.userId, userId)));

  if (!existing) return;

  if (existing.gcId) {
    await updateGCalEvent(token, existing.gcId, event);
  } else {
    const gcId = await createGCalEvent(token, event);
    if (gcId) {
      await db
        .update(scheduleBlocksTable)
        .set({ googleCalendarEventId: gcId })
        .where(eq(scheduleBlocksTable.id, blockId));
    }
  }
}

/**
 * Delete a schedule block's Google Calendar event.
 * Pass `gcEventId` (read from the row before it is deleted) to avoid a
 * read-after-delete race.  If omitted the function falls back to a DB lookup,
 * which only works when the row still exists.
 */
export async function deleteBlockFromGCal(
  userId: number,
  blockId: number,
  gcEventId?: string | null,
): Promise<void> {
  const token = await getValidCalToken(userId);
  if (!token) return;

  let resolvedGcId = gcEventId;
  if (!resolvedGcId && resolvedGcId !== null) {
    const [block] = await db
      .select({ gcId: scheduleBlocksTable.googleCalendarEventId })
      .from(scheduleBlocksTable)
      .where(and(eq(scheduleBlocksTable.id, blockId), eq(scheduleBlocksTable.userId, userId)));
    resolvedGcId = block?.gcId ?? null;
  }

  if (resolvedGcId) {
    await deleteGCalEvent(token, resolvedGcId);
  }
}

export async function syncSessionToGCal(
  organizerId: number,
  sessionId: number,
  session: {
    title: string;
    startsAt: string;
    durationMinutes: number;
    meetingUrl: string;
    topic?: string | null;
  },
): Promise<void> {
  const token = await getValidCalToken(organizerId);
  if (!token) return;

  const startMs = new Date(session.startsAt).getTime();
  const endIso = new Date(startMs + session.durationMinutes * 60 * 1000).toISOString();

  const event: GCalEventInput = {
    summary: session.title,
    description: session.topic ?? undefined,
    location: session.meetingUrl,
    startIso: session.startsAt,
    endIso,
  };

  const [existing] = await db
    .select({ gcId: studySessionsTable.googleCalendarEventId })
    .from(studySessionsTable)
    .where(
      and(eq(studySessionsTable.id, sessionId), eq(studySessionsTable.organizerId, organizerId)),
    );

  if (!existing) return;

  if (existing.gcId) {
    await updateGCalEvent(token, existing.gcId, event);
  } else {
    const gcId = await createGCalEvent(token, event);
    if (gcId) {
      await db
        .update(studySessionsTable)
        .set({ googleCalendarEventId: gcId })
        .where(eq(studySessionsTable.id, sessionId));
    }
  }
}

/**
 * Delete a study session's Google Calendar event.
 * Pass `gcEventId` (read from the row before it is deleted) to avoid a
 * read-after-delete race.  If omitted the function falls back to a DB lookup.
 */
export async function deleteSessionFromGCal(
  organizerId: number,
  sessionId: number,
  gcEventId?: string | null,
): Promise<void> {
  const token = await getValidCalToken(organizerId);
  if (!token) return;

  let resolvedGcId = gcEventId;
  if (!resolvedGcId && resolvedGcId !== null) {
    const [session] = await db
      .select({ gcId: studySessionsTable.googleCalendarEventId })
      .from(studySessionsTable)
      .where(
        and(eq(studySessionsTable.id, sessionId), eq(studySessionsTable.organizerId, organizerId)),
      );
    resolvedGcId = session?.gcId ?? null;
  }

  if (resolvedGcId) {
    await deleteGCalEvent(token, resolvedGcId);
  }
}

// ── GET /calendar/status, connection status + iCal secret ────────────────────

router.get("/calendar/status", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const icalSecret = await ensureCalendarTokenRow(userId);

  const [row] = await db
    .select({
      googleAccessToken: calendarTokensTable.googleAccessToken,
    })
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.userId, userId));

  res.json({
    googleConnected: Boolean(row?.googleAccessToken),
    googleConfigured: CAL_CONFIGURED,
    icalSecret,
  });
});

// ── GET /calendar/google/connect, return OAuth URL ──────────────────────────

router.get("/calendar/google/connect", requireAuth, (req, res): void => {
  if (!CAL_CONFIGURED) {
    res.status(503).json({ error: "Google OAuth is not configured on this server" });
    return;
  }

  const { userId } = req as AuthenticatedRequest;
  const state = makeState(userId);
  const redirectUri =
    GOOGLE_CAL_REDIRECT_URI_OVERRIDE ||
    `${req.protocol}://${req.get("host")}/api/calendar/google/callback`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CAL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// ── GET /calendar/google/callback, handle OAuth callback ────────────────────

router.get("/calendar/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code || !state) {
    res.redirect("/?cal_error=1");
    return;
  }

  const userId = verifyState(state);
  if (!userId) {
    res.redirect("/?cal_error=invalid_state");
    return;
  }

  const redirectUri =
    GOOGLE_CAL_REDIRECT_URI_OVERRIDE ||
    `${req.protocol}://${req.get("host")}/api/calendar/google/callback`;

  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!tokenResp.ok) {
    res.redirect("/?cal_error=token_exchange");
    return;
  }

  const tokenData = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // Upsert the calendar token row
  const [existing] = await db
    .select({ id: calendarTokensTable.id })
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.userId, userId));

  if (existing) {
    await db
      .update(calendarTokensTable)
      .set({
        googleAccessToken: tokenData.access_token,
        googleRefreshToken: tokenData.refresh_token ?? null,
        googleTokenExpiry: expiry,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(calendarTokensTable.userId, userId));
  } else {
    await db.insert(calendarTokensTable).values({
      userId,
      googleAccessToken: tokenData.access_token,
      googleRefreshToken: tokenData.refresh_token ?? null,
      googleTokenExpiry: expiry,
      icalSecret: crypto.randomUUID(),
    });
  }

  res.redirect("/profile?cal_connected=1");
});

// ── DELETE /calendar/google/disconnect ───────────────────────────────────────

router.delete("/calendar/google/disconnect", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  await db
    .update(calendarTokensTable)
    .set({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(calendarTokensTable.userId, userId));

  res.status(204).send();
});

// ── GET /calendar/:icalSecret/feed.ics, iCal subscription feed ──────────────

router.get("/calendar/:icalSecret/feed.ics", async (req, res): Promise<void> => {
  const { icalSecret } = req.params;

  const [row] = await db
    .select({ userId: calendarTokensTable.userId })
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.icalSecret, icalSecret));

  if (!row) {
    res.status(404).send("Not found");
    return;
  }

  const userId = row.userId;

  // Fetch user name for calendar title
  const [user] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const events: ICalEvent[] = [];

  // Schedule blocks
  const blocks = await db
    .select()
    .from(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.userId, userId));

  for (const block of blocks) {
    const startIso = blockDateTimeToIso(block.date, block.startTime);
    const endIso = blockDateTimeToIso(block.date, block.endTime);
    events.push({
      uid: `schooler-block-${block.id}@schooler`,
      summary: block.title,
      dtstart: startIso,
      dtend: endIso,
      description: block.notes ?? undefined,
      createdAt: block.createdAt,
    });
  }

  // Study sessions (where user is organiser or participant)
  const participantRows = await db
    .select({ sessionId: studySessionParticipantsTable.sessionId })
    .from(studySessionParticipantsTable)
    .where(eq(studySessionParticipantsTable.userId, userId));
  const participantSessionIds = participantRows.map((r) => r.sessionId);

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
    );

  for (const session of sessions) {
    const startMs = new Date(session.startsAt).getTime();
    const endIso = new Date(startMs + session.durationMinutes * 60 * 1000).toISOString();
    events.push({
      uid: `schooler-session-${session.id}@schooler`,
      summary: session.title,
      dtstart: session.startsAt,
      dtend: endIso,
      description: session.topic ?? undefined,
      location: session.meetingUrl,
      createdAt: session.createdAt,
    });
  }

  /*
   * X-WR-CALNAME is the name of the calendar in the subscriber's own app.
   *
   * It said "Schooler", so anybody who subscribed from Apple Calendar,
   * Outlook or Google saw a calendar called "…'s Schooler Schedule" sitting in
   * their sidebar under a name this product has not used for a while. A feed
   * is the one surface a rename cannot reach on its own: it lives on their
   * device until they resubscribe.
   *
   * The UIDs below are deliberately left alone. A calendar app matches events
   * by UID, so changing the scheme would not rename anything -- it would make
   * every existing event look new, and anybody already subscribed would get a
   * second copy of their whole schedule alongside the first.
   */
  const calName = user?.name ? `${user.name}'s Casparel Schedule` : "Casparel Schedule";
  const icsContent = renderIcalFeed(events, calName);

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="casparel.ics"');
  res.send(icsContent);
});

// ── GET /schedule/:blockId/export.ics, single block export ──────────────────

router.get("/schedule/:blockId/export.ics", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const blockId = Number(req.params.blockId);

  if (isNaN(blockId)) {
    res.status(400).json({ error: "Invalid block id" });
    return;
  }

  const [block] = await db
    .select()
    .from(scheduleBlocksTable)
    .where(and(eq(scheduleBlocksTable.id, blockId), eq(scheduleBlocksTable.userId, userId)));

  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }

  const startIso = blockDateTimeToIso(block.date, block.startTime);
  const endIso = blockDateTimeToIso(block.date, block.endTime);
  const event: ICalEvent = {
    uid: `schooler-block-${block.id}@schooler`,
    summary: block.title,
    dtstart: startIso,
    dtend: endIso,
    description: block.notes ?? undefined,
    createdAt: block.createdAt,
  };

  const icsContent = renderIcalFeed([event], block.title);
  const safeName = block.title.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40);

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.ics"`);
  res.send(icsContent);
});

// ── GET /study-sessions/:sessionId/export.ics, single session export ─────────

router.get("/study-sessions/:sessionId/export.ics", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const sessionId = Number(req.params.sessionId);

  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const [session] = await db
    .select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.id, sessionId));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Must be organiser or participant to export, prevent data leakage
  const isOrganizer = session.organizerId === userId;
  if (!isOrganizer) {
    const [participant] = await db
      .select({ userId: studySessionParticipantsTable.userId })
      .from(studySessionParticipantsTable)
      .where(
        and(
          eq(studySessionParticipantsTable.sessionId, sessionId),
          eq(studySessionParticipantsTable.userId, userId),
        ),
      );
    if (!participant) {
      res.status(403).json({ error: "Not a participant or organiser" });
      return;
    }
  }

  const startMs = new Date(session.startsAt).getTime();
  const endIso = new Date(startMs + session.durationMinutes * 60 * 1000).toISOString();

  const event: ICalEvent = {
    uid: `schooler-session-${session.id}@schooler`,
    summary: session.title,
    dtstart: session.startsAt,
    dtend: endIso,
    description: session.topic ?? undefined,
    location: session.meetingUrl,
    createdAt: session.createdAt,
  };

  const icsContent = renderIcalFeed([event], session.title);
  const safeName = session.title.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40);

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.ics"`);
  res.send(icsContent);
});

// ── GET /calendar/ical-url, convenience endpoint returning the feed URL ──────

router.get("/calendar/ical-url", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const icalSecret = await ensureCalendarTokenRow(userId);

  // Use host from request to build URL
  const baseUrl = `${req.protocol}://${req.get("host")}/api/calendar/${icalSecret}/feed.ics`;
  res.json({ url: baseUrl, icalSecret });
});

export default router;
