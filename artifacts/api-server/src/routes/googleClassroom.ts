/**
 * @fileOverview API role: implements the Google Classroom HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
/**
 * Google Classroom integration routes.
 *
 * All routes require authentication and durable educator capability.
 *
 * OAuth flow:
 *  1. Teacher clicks "Connect" → GET /api/auth/google (returns auth URL)
 *  2. Frontend redirects browser to the returned URL
 *  3. Google redirects → GET /api/auth/google/callback
 *  4. Server stores tokens in DB → redirects browser to /classes?gc_connected=1
 *
 * All GC API calls auto-refresh the access token when it's within 5 min of expiry.
 * If the refresh fails (token revoked), the row is deleted and a 401 is returned.
 */
import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  googleTokensTable,
  resourceListsTable,
  listItemsTable,
  resourcesTable,
  classesTable,
  classMembersTable,
} from "@workspace/db";
import {
  GetGCAuthUrlResponse,
  GetGCStatusResponse,
  ListGCCoursesResponse,
  ShareToGCBody,
  ShareToGCResponse,
  ImportGCCourseBody,
  ImportGCCourseResponse,
  GetGCCourseStudentsParams,
  GetGCCourseStudentsResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";

const router: IRouter = Router();

// ── Config ────────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const SECRET = process.env.SESSION_SECRET ?? "";

// Operators set GOOGLE_REDIRECT_URI to the exact HTTPS callback registered in
// the Google Cloud Console (e.g. https://<repl-domain>/api/auth/google/callback).
// When unset the URI is derived from the incoming request, only safe after
// `app.set("trust proxy", 1)` so req.protocol returns "https" behind Replit.
const GOOGLE_REDIRECT_URI_OVERRIDE = process.env.GOOGLE_REDIRECT_URI ?? "";

// Both credentials must be present for the integration to be considered configured.
const GC_CONFIGURED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  // Required to verify teacher membership via GET /v1/courses/{id}/teachers/me
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.announcements",
].join(" ");

// ── Middleware: educator capability required ──────────────────────────────────

async function requireEducator(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
): Promise<void> {
  const { educatorEnabled } = req as AuthenticatedRequest;
  if (!educatorEnabled) {
    res.status(403).json({ error: "Educator capability is required to use Google Classroom integration" });
    return;
  }
  next();
}

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
    // Expire state after 15 minutes
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return Number(userIdStr);
  } catch {
    return null;
  }
}

// ── Token refresh helper ──────────────────────────────────────────────────────

async function getValidToken(userId: number): Promise<string | null> {
  const [row] = await db
    .select()
    .from(googleTokensTable)
    .where(eq(googleTokensTable.userId, userId));

  if (!row) return null;

  // Still valid with a 5-minute buffer
  if (row.expiresAt && new Date(row.expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return row.accessToken;
  }

  // Need to refresh
  if (!row.refreshToken) {
    await db.delete(googleTokensTable).where(eq(googleTokensTable.userId, userId));
    return null;
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: row.refreshToken,
    grant_type: "refresh_token",
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    // Revoked, clean up
    await db.delete(googleTokensTable).where(eq(googleTokensTable.userId, userId));
    return null;
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await db
    .update(googleTokensTable)
    .set({ accessToken: data.access_token, expiresAt, updatedAt: new Date().toISOString() })
    .where(eq(googleTokensTable.userId, userId));

  return data.access_token;
}

// ── Course teacher-membership helper ─────────────────────────────────────────
/**
 * Returns true only when the Google account associated with `token` is an
 * active teacher of `courseId`.  Uses the authoritative
 * `GET /v1/courses/{courseId}/teachers/me` endpoint, this returns 200 only
 * for actual teachers and 404/403 for enrolled students or non-members.
 */
async function isTeacherOfCourse(courseId: string, token: string): Promise<boolean> {
  const resp = await fetch(
    `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/teachers/me`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return resp.ok;
}

// ── GET /auth/google, return OAuth authorization URL (educators) ─────────────

router.get("/auth/google", requireAuth, requireEducator, (req, res): void => {
  if (!GC_CONFIGURED) {
    res.status(503).json({ error: "Google OAuth is not configured on this server" });
    return;
  }

  const { userId } = req as AuthenticatedRequest;
  const state = makeState(userId);
  const redirectUri =
    GOOGLE_REDIRECT_URI_OVERRIDE ||
    `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  res.json(
    GetGCAuthUrlResponse.parse({
      url: `https://accounts.google.com/o/oauth2/auth?${params.toString()}`,
    }),
  );
});

// ── GET /auth/google/callback, exchange code for tokens ─────────────────────
// Note: this is a browser redirect, no auth header; userId comes from state param.

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  // Derive the public frontend base from the configured redirect URI when available,
  // otherwise fall back to the (proxy-aware) request host.
  const apiBase =
    GOOGLE_REDIRECT_URI_OVERRIDE
      ? GOOGLE_REDIRECT_URI_OVERRIDE.replace(/\/api\/auth\/google\/callback$/, "")
      : `${req.protocol}://${req.get("host")}`;
  const frontendBase = apiBase;

  if (error) {
    res.redirect(`${frontendBase}/classes?gc_error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendBase}/classes?gc_error=missing_params`);
    return;
  }

  const userId = verifyState(state);
  if (!userId) {
    res.redirect(`${frontendBase}/classes?gc_error=invalid_state`);
    return;
  }

  const redirectUri =
    GOOGLE_REDIRECT_URI_OVERRIDE ||
    `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  let tokenData: { access_token: string; refresh_token?: string; expires_in: number };

  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error("Google token exchange failed:", errBody);
      res.redirect(`${frontendBase}/classes?gc_error=token_exchange_failed`);
      return;
    }

    tokenData = (await tokenResp.json()) as typeof tokenData;
  } catch (err) {
    console.error("Google token exchange error:", err);
    res.redirect(`${frontendBase}/classes?gc_error=network_error`);
    return;
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  const now = new Date().toISOString();

  await db
    .insert(googleTokensTable)
    .values({
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleTokensTable.userId,
      set: {
        accessToken: tokenData.access_token,
        ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
        expiresAt,
        updatedAt: now,
      },
    });

  res.redirect(`${frontendBase}/classes?gc_connected=1`);
});

// ── GET /google-classroom/status (educators) ──────────────────────────────────

router.get("/google-classroom/status", requireAuth, requireEducator, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const configured = GC_CONFIGURED;
  const [row] = await db
    .select({ id: googleTokensTable.id })
    .from(googleTokensTable)
    .where(eq(googleTokensTable.userId, userId));
  res.json(GetGCStatusResponse.parse({ connected: !!row, configured }));
});

// ── GET /google-classroom/courses (educators) ─────────────────────────────────

router.get("/google-classroom/courses", requireAuth, requireEducator, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const token = await getValidToken(userId);

  if (!token) {
    res.status(401).json({
      error: "Google Classroom not connected or access was revoked. Please reconnect.",
    });
    return;
  }

  const resp = await fetch(
    "https://classroom.googleapis.com/v1/courses?teacherId=me&courseStates=ACTIVE&pageSize=50",
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!resp.ok) {
    const detail = await resp.text();
    res.status(resp.status).json({ error: "Failed to fetch Google Classroom courses", detail });
    return;
  }

  const data = (await resp.json()) as {
    courses?: Array<{ id: string; name: string; section?: string; description?: string }>;
  };

  const courses = (data.courses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    section: c.section ?? null,
  }));

  res.json(ListGCCoursesResponse.parse(courses));
});

// ── POST /google-classroom/import-course (teacher only) ───────────────────────
// Creates a new Casparel class from a Google Classroom course.

router.post(
  "/google-classroom/import-course",
  contentLimiter,
  requireAuth,
  requireEducator,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;

    const parsed = ImportGCCourseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { courseId } = parsed.data;

    const token = await getValidToken(userId);
    if (!token) {
      res.status(401).json({
        error: "Google Classroom not connected or access was revoked. Please reconnect.",
      });
      return;
    }

    // Verify teacher membership before fetching details or writing anything.
    // GET /v1/courses/{id}/teachers/me returns 200 only for teachers.
    const teacherVerified = await isTeacherOfCourse(courseId, token);
    if (!teacherVerified) {
      res.status(403).json({
        error:
          "You are not a teacher for the specified Google Classroom course, or it does not exist.",
      });
      return;
    }

    // Fetch course details from Google Classroom
    const courseResp = await fetch(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!courseResp.ok) {
      const detail = await courseResp.text();
      res.status(courseResp.status).json({ error: "Failed to fetch course details", detail });
      return;
    }

    const course = (await courseResp.json()) as {
      id: string;
      name: string;
      section?: string;
      descriptionHeading?: string;
      description?: string;
    };

    // Create Casparel class using course data
    const [cls] = await db
      .insert(classesTable)
      .values({
        name: course.name,
        subject: course.section ?? "General",
        gradeLevel: "Imported",
        description: course.descriptionHeading ?? course.description ?? null,
        teacherId: userId,
      })
      .returning();

    // Auto-enroll the teacher
    await db
      .insert(classMembersTable)
      .values({ userId, classId: cls.id, role: "teacher" })
      .onConflictDoNothing();

    res.status(201).json(ImportGCCourseResponse.parse({ ...cls, memberCount: 1 }));
  },
);

// ── GET /google-classroom/courses/:courseId/students (teacher only) ───────────
// Returns the enrolled students for a GC course, with EduHub link status.

router.get(
  "/google-classroom/courses/:courseId/students",
  requireAuth,
  requireEducator,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;

    const params = GetGCCourseStudentsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { courseId } = params.data;

    const token = await getValidToken(userId);
    if (!token) {
      res.status(401).json({
        error: "Google Classroom not connected or access was revoked. Please reconnect.",
      });
      return;
    }

    // Verify teacher membership before listing students.
    const teacherVerified = await isTeacherOfCourse(courseId, token);
    if (!teacherVerified) {
      res.status(403).json({
        error:
          "You are not a teacher for the specified Google Classroom course, or it does not exist.",
      });
      return;
    }

    // Fetch students from Google Classroom (up to 200 per request; no pagination needed for typical classes).
    const gcResp = await fetch(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/students?pageSize=200`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!gcResp.ok) {
      const detail = await gcResp.text();
      res.status(gcResp.status).json({ error: "Failed to fetch course students", detail });
      return;
    }

    const gcData = (await gcResp.json()) as {
      students?: Array<{
        userId: string;
        profile: { name: { fullName: string }; emailAddress: string };
      }>;
    };

    const gcStudents = gcData.students ?? [];

    // Collect emails to look up EduHub accounts in one query.
    const emails = gcStudents.map((s) => s.profile.emailAddress).filter(Boolean);

    let emailToUserId: Record<string, number> = {};
    if (emails.length > 0) {
      const { usersTable } = await import("@workspace/db");
      const { inArray } = await import("drizzle-orm");
      const rows = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(inArray(usersTable.email, emails));
      for (const row of rows) {
        emailToUserId[row.email] = row.id;
      }
    }

    const students = gcStudents.map((s) => ({
      gcUserId: s.userId,
      name: s.profile.name.fullName,
      email: s.profile.emailAddress,
      linkedUserId: emailToUserId[s.profile.emailAddress] ?? null,
    }));

    res.json(GetGCCourseStudentsResponse.parse(students));
  },
);

// ── POST /google-classroom/share (educators) ──────────────────────────────────

router.post("/google-classroom/share", contentLimiter, requireAuth, requireEducator, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const parsed = ShareToGCBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { listId, courseId } = parsed.data;

  // Verify list ownership
  const [list] = await db
    .select()
    .from(resourceListsTable)
    .where(eq(resourceListsTable.id, listId));

  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }
  if (list.ownerId !== userId) {
    res.status(403).json({ error: "Only the list owner can share it to Google Classroom" });
    return;
  }

  const token = await getValidToken(userId);
  if (!token) {
    res.status(401).json({
      error: "Google Classroom not connected or access was revoked. Please reconnect.",
    });
    return;
  }

  // Verify the authenticated Google account is a *teacher* for this course.
  // GET /v1/courses/{id}/teachers/me returns 200 only for teachers;
  // enrolled students or non-members get 404/403.
  const teacherVerified = await isTeacherOfCourse(courseId, token);
  if (!teacherVerified) {
    res.status(403).json({
      error:
        "You are not a teacher for the specified Google Classroom course, or it does not exist.",
    });
    return;
  }

  // Fetch list items
  const items = await db
    .select({ resource: resourcesTable })
    .from(listItemsTable)
    .innerJoin(resourcesTable, eq(listItemsTable.resourceId, resourcesTable.id))
    .where(eq(listItemsTable.listId, listId));

  // Build announcement text
  const lines = items.map((i) => `• ${i.resource.title}\n  ${i.resource.url}`).join("\n");
  const text = [
    `📚 ${list.name}`,
    list.description ?? "",
    items.length > 0
      ? `\nResources (${items.length}):\n${lines}`
      : "\nNo resources in this list yet.",
  ]
    .filter(Boolean)
    .join("\n");

  const announcementResp = await fetch(
    `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/announcements`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    },
  );

  if (!announcementResp.ok) {
    const detail = await announcementResp.text();
    res
      .status(announcementResp.status)
      .json({ error: "Failed to post to Google Classroom", detail });
    return;
  }

  const announcement = (await announcementResp.json()) as {
    id: string;
    alternateLink?: string;
  };

  res.json(
    ShareToGCResponse.parse({
      announcementId: announcement.id,
      url: announcement.alternateLink ?? "",
    }),
  );
});

// ── DELETE /auth/google, disconnect (educators) ───────────────────────────────

router.delete("/auth/google", requireAuth, requireEducator, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const [row] = await db
    .select()
    .from(googleTokensTable)
    .where(eq(googleTokensTable.userId, userId));

  if (row) {
    // Best-effort revoke with Google
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.accessToken)}`,
        { method: "POST" },
      );
    } catch {
      // Ignore, we always remove from DB
    }
    await db.delete(googleTokensTable).where(eq(googleTokensTable.userId, userId));
  }

  res.sendStatus(204);
});

export default router;
