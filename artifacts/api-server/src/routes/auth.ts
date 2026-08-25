/**
 * @fileOverview API role: implements the Auth HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import {
  eq,
  and,
  or,
  ilike,
  inArray,
  isNull,
  ne,
  sql,
  desc,
} from "drizzle-orm";
import multer from "multer";
import { z } from "zod/v4";
import {
  db,
  pool,
  activityLogTable,
  calendarTokensTable,
  canvasesTable,
  usersTable,
  classMembersTable,
  userBlocksTable,
  userReportsTable,
  resourcesTable,
  resourceListsTable,
  userPreferencesTable,
  googleTokensTable,
  learningEvidenceTable,
  learningGoalsTable,
  scheduleBlocksTable,
  studyActivitiesTable,
  workflowEventsTable,
  forumPostsTable,
  forumCommentsTable,
  forumMaterialsTable,
  forumMaterialApprovalsTable,
  forumReportsTable,
  goalPathTemplatesTable,
} from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
  RegisterResponse,
  LoginResponse,
  GetMeResponse,
  GetMyUsageResponse,
  UpdateMeBody,
  UpdateMeResponse,
  SwitchRoleBody,
  SwitchRoleResponse,
  GetPublicProfileParams,
  GetPublicProfileResponse,
  GetUserLibraryParams,
  GetUserLibraryResponse,
  UploadAvatarResponse,
  SetPresetAvatarBody,
  SetPresetAvatarResponse,
  SearchUsersQueryParams,
  GetUserSafetyStatusParams,
  GetUserSafetyStatusResponse,
  BlockUserParams,
  BlockUserResponse,
  UnblockUserParams,
  ReportUserParams,
  ReportUserBody,
  ReportUserResponse,
  DeleteMeBody,
  ResetMeBody,
} from "@workspace/api-zod";
import { hashPassword, verifyPassword, issueToken } from "../lib/auth";
import { isAllowlistedAdminEmail } from "../lib/adminAccess";
import { resolveAccountPlan } from "../lib/entitlements";
import { accountCapacityReport } from "../lib/planCapacity";
import { deepAllowance } from "../lib/deepAllowance";
import { publicUserColumns } from "../lib/userColumns";
import { publicResourceColumns } from "../lib/resourceColumns";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { validationMessage } from "../lib/validationMessage";

const PRESET_AVATARS: Record<
  string,
  { bg: string; accent: string; emoji: string }
> = {
  "cosmic-cat": { bg: "#312e81", accent: "#a5b4fc", emoji: "🐱" },
  "sunny-fox": { bg: "#f97316", accent: "#ffedd5", emoji: "🦊" },
  "clever-owl": { bg: "#7c3aed", accent: "#ede9fe", emoji: "🦉" },
  "ocean-otter": { bg: "#0369a1", accent: "#bae6fd", emoji: "🦦" },
  "mint-panda": { bg: "#047857", accent: "#d1fae5", emoji: "🐼" },
  "brave-lion": { bg: "#b45309", accent: "#fef3c7", emoji: "🦁" },
  "star-bunny": { bg: "#be185d", accent: "#fce7f3", emoji: "🐰" },
  "purple-koala": { bg: "#6d28d9", accent: "#ddd6fe", emoji: "🐨" },
  "red-panda": { bg: "#b91c1c", accent: "#fee2e2", emoji: "🐻" },
  "sky-penguin": { bg: "#075985", accent: "#e0f2fe", emoji: "🐧" },
  "green-frog": { bg: "#15803d", accent: "#dcfce7", emoji: "🐸" },
  "moon-wolf": { bg: "#334155", accent: "#e2e8f0", emoji: "🐺" },
};

function presetAvatarDataUrl(avatarId: string): string | null {
  const avatar = PRESET_AVATARS[avatarId];
  if (!avatar) return null;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="128" fill="' +
    avatar.bg +
    '"/><circle cx="128" cy="132" r="94" fill="' +
    avatar.accent +
    '" opacity=".28"/><text x="128" y="160" text-anchor="middle" font-size="112">' +
    avatar.emoji +
    "</text></svg>";
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

// Multer for avatar upload, 2 MB limit, memory storage.
// fileFilter accepts everything so we can read the buffer first; the real
// validation is content-based (magic bytes) done AFTER multer reads the file.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

/**
 * Inspect raw bytes to verify the upload is an allowed raster image format
 * (PNG, JPEG, WebP). Returns the canonical MIME type on success, or null if
 * the bytes do not match a supported format.
 *
 * Deliberately excludes SVG (text/xml) and all other non-raster formats even
 * when the client claims an image/* MIME type, MIME is client-controlled and
 * cannot be trusted.
 */
function detectRasterImageMime(
  buf: Buffer,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF????WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

const router: IRouter = Router();

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
const userPreferencesPatch = z
  .object({
    language: z.enum(["en", "tr"]).optional(),
    interfaceColors: z
      .object({
        background: hexColor,
        surface: hexColor,
        primary: hexColor,
        accent: hexColor,
      })
      .nullable()
      .optional(),
    ambientStyle: z
      .enum(["off", "net", "globe", "halo", "cells", "rings", "topology"])
      .optional(),
    ambientIntensity: z.number().min(0.5).max(2).optional(),
    readNotificationIds: z
      .array(z.number().int().positive())
      .max(500)
      .optional(),
    dashboardGoalIds: z
      .record(z.string(), z.number().int().positive())
      .optional(),
    continueStudying: z
      .record(z.string(), z.array(z.number().int().positive()).max(6))
      .optional(),
    pendingCheckIns: z
      .record(
        z.string(),
        z.object({
          concept: z.string().trim().min(1).max(300),
          prompt: z.string().trim().min(1).max(600),
        }),
      )
      .optional(),
    searchHistory: z
      .array(
        z.object({
          query: z.string().trim().min(1).max(300),
          searchedAt: z.iso.datetime(),
          // The filters the search ran with. Without them here a zod object
          // strips the key, and a recent search replays as its words alone.
          filters: z
            .record(
              z.string().max(40),
              z.union([z.string().max(160), z.number(), z.boolean()]),
            )
            .optional(),
        }),
      )
      .max(12)
      .optional(),
    resourceSearchState: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional(),
    allowMessageRequests: z.boolean().optional(),
    tutorialSeen: z.boolean().optional(),
  })
  .strict();

function defaultUserPreferences(userId: number) {
  return {
    userId,
    language: null,
    interfaceColors: null,
    ambientStyle: null,
    ambientIntensity: null,
    readNotificationIds: [] as number[],
    dashboardGoalIds: {} as Record<string, number>,
    continueStudying: {} as Record<string, number[]>,
    pendingCheckIns: {} as Record<string, { concept: string; prompt: string }>,
    searchHistory: [] as Array<{ query: string; searchedAt: string }>,
    resourceSearchState: null as Record<string, unknown> | null,
    allowMessageRequests: true,
    tutorialSeen: true,
    updatedAt: new Date(0).toISOString(),
  };
}

router.get(
  "/users/me/preferences",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const [preferences] = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId));
    res.json(preferences ?? defaultUserPreferences(userId));
  },
);

router.patch(
  "/users/me/preferences",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > 250_000) {
      res.status(413).json({ error: "Preferences payload is too large" });
      return;
    }
    const parsed = userPreferencesPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const [preferences] = await db
      .insert(userPreferencesTable)
      .values({ userId, ...parsed.data, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: userPreferencesTable.userId,
        set: { ...parsed.data, updatedAt: new Date().toISOString() },
      })
      .returning();
    res.json(preferences);
  },
);

// Sign-in and registration are rate limited in app.ts, at the mount point,
// not here. This file used to define its own limiter and attach it to the
// handlers below, which protected nothing: routes/loginCompat.ts declares a
// second POST /auth/login and is mounted first, so Express never reached the
// limited copy. See authLimiter in lib/limiters.ts.

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  // role is always "student" for new accounts, not client-controlled
  const { email, password, name } = parsed.data;
  const role = "student";
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name, role })
    .returning(publicUserColumns);
  const token = issueToken(user.id, user.role, user.activeRole);
  res.status(201).json(RegisterResponse.parse({ user, token }));
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const { email, password } = parsed.data;
  // Project explicitly (contract fields + the hash we need to verify against)
  // so a pending migration can never take down login itself.
  const [row] = await db
    .select({ ...publicUserColumns, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (!row) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const { passwordHash: _passwordHash, ...user } = row;
  let loggedInUser = user;
  if (user.role !== "admin" && isAllowlistedAdminEmail(user.email)) {
    [loggedInUser] = await db
      .update(usersTable)
      .set({ role: "admin" })
      .where(eq(usersTable.id, user.id))
      .returning(publicUserColumns);
  }
  const token = issueToken(
    loggedInUser.id,
    loggedInUser.role,
    loggedInUser.activeRole,
  );
  res.json(LoginResponse.parse({ user: loggedInUser, token }));
});

// POST /auth/logout
router.post("/auth/logout", (_req, res): void => {
  res.sendStatus(204);
});

// GET /users/me
router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  // Project exactly the fields the contract returns. A bare .select() pulls
  // every column, which (a) selects password_hash for no reason and (b) makes
  // this endpoint fail outright whenever the schema gains a column the deployed
  // database has not migrated yet, and because the whole sidebar (profile,
  // plan, role switcher) is gated on this one call, that failure blanks it.
  const [user] = await db
    .select(publicUserColumns)
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(GetMeResponse.parse(user));
});

router.get("/users/me/access", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const [user] = await db
    .select({
      bannedAt: usersTable.bannedAt,
      bannedReason: usersTable.bannedReason,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const adminContact =
    process.env.ADMIN_EMAILS?.split(",")
      .map((email) => email.trim())
      .find(Boolean) ?? "baharyuksel0403@gmail.com";
  res.json({
    banned: Boolean(user.bannedAt),
    bannedAt: user.bannedAt,
    bannedReason: user.bannedReason,
    adminContact,
  });
});

/** One name for a deleted account, used everywhere a copy of it was kept. */
const DELETED_USER_NAME = "Deleted user";

type AccountTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Delete account-private state without touching collaborative records.
 *
 * A reset must not silently erase another person's work. Classes, messages,
 * submitted/verified resources, forum contributions, public path templates,
 * and class-linked activities/canvases therefore remain. Personal schedules,
 * goals, evidence, non-class lists/activities, private canvases, device
 * integrations, preferences, local analytics history, and unpublished
 * resources can be removed safely because this account is their only owner.
 *
 * The caller supplies a transaction and performs the profile update in that
 * same transaction. A database error therefore leaves the account entirely
 * unchanged instead of producing a half-reset account.
 */
async function clearPrivateAccountData(
  tx: AccountTransaction,
  userId: number,
): Promise<void> {
  await tx
    .delete(learningEvidenceTable)
    .where(eq(learningEvidenceTable.userId, userId));
  await tx
    .delete(workflowEventsTable)
    .where(eq(workflowEventsTable.userId, userId));
  await tx
    .delete(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.userId, userId));
  await tx
    .delete(resourceListsTable)
    .where(
      and(
        eq(resourceListsTable.ownerId, userId),
        isNull(resourceListsTable.classId),
      ),
    );
  await tx
    .delete(learningGoalsTable)
    .where(eq(learningGoalsTable.userId, userId));
  await tx
    .delete(studyActivitiesTable)
    .where(
      and(
        eq(studyActivitiesTable.ownerId, userId),
        isNull(studyActivitiesTable.classId),
      ),
    );
  await tx
    .delete(canvasesTable)
    .where(
      and(
        eq(canvasesTable.ownerId, userId),
        eq(canvasesTable.visibility, "private"),
      ),
    );
  await tx
    .delete(resourcesTable)
    .where(
      and(
        eq(resourcesTable.submittedById, userId),
        ne(resourcesTable.verificationStatus, "verified"),
      ),
    );
  await tx.delete(activityLogTable).where(eq(activityLogTable.userId, userId));
  await tx
    .delete(calendarTokensTable)
    .where(eq(calendarTokensTable.userId, userId));
  await tx
    .delete(googleTokensTable)
    .where(eq(googleTokensTable.userId, userId));
  await tx
    .delete(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));
  await tx.delete(userBlocksTable).where(eq(userBlocksTable.blockerId, userId));
}

async function destructiveActionAccount(userId: number) {
  const [account] = await db
    .select({
      passwordHash: usersTable.passwordHash,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return account;
}

router.post(
  "/users/me/reset",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ResetMeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { userId } = req as AuthenticatedRequest;
    const account = await destructiveActionAccount(userId);
    if (
      !account ||
      !(await verifyPassword(parsed.data.password, account.passwordHash))
    ) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    await db.transaction(async (tx) => {
      await clearPrivateAccountData(tx, userId);
      await tx
        .update(usersTable)
        .set({
          activeRole: account.role,
          avatarUrl: null,
          bio: null,
          subjects: null,
          gradeOrDept: null,
          timezone: null,
          profileVisibility: "classmates",
          libraryVisibility: "classmates",
          showBio: true,
          showSubjects: true,
          showGradeOrDept: true,
          showWebsite: true,
          websiteUrl: null,
        })
        .where(eq(usersTable.id, userId));
    });
    res.sendStatus(204);
  },
);

router.delete(
  "/users/me",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    /**
     * What the rest of the database calls a deleted account.
     *
     * Kept inside the handler so unit tests with deliberately partial table
     * mocks can still import the router. deletionAnonymises.test.ts reads this
     * map and fails when a new copied person-name column is not included.
     */
    const NAME_COPIES = [
      [forumPostsTable, forumPostsTable.authorId, "authorName"],
      [forumCommentsTable, forumCommentsTable.authorId, "authorName"],
      [forumMaterialsTable, forumMaterialsTable.uploaderId, "uploaderName"],
      [
        forumMaterialApprovalsTable,
        forumMaterialApprovalsTable.teacherId,
        "teacherName",
      ],
      [forumReportsTable, forumReportsTable.reporterId, "reporterName"],
      [goalPathTemplatesTable, goalPathTemplatesTable.creatorId, "creatorName"],
    ] as const;

    const parsed = DeleteMeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { userId } = req as AuthenticatedRequest;
    const account = await destructiveActionAccount(userId);
    if (
      !account ||
      !(await verifyPassword(parsed.data.password, account.passwordHash))
    ) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const deletedMarker = `deleted-account-${userId}-${Date.now()}`;
    await db.transaction(async (tx) => {
      await clearPrivateAccountData(tx, userId);
      const [user] = await tx
        .update(usersTable)
        .set({
          email: deletedMarker + "@invalid.local",
          passwordHash: deletedMarker,
          name: DELETED_USER_NAME,
          role: "student",
          activeRole: "student",
          avatarUrl: null,
          bio: null,
          subjects: null,
          gradeOrDept: null,
          timezone: null,
          profileVisibility: "private",
          libraryVisibility: "private",
          showBio: false,
          showSubjects: false,
          showGradeOrDept: false,
          showWebsite: false,
          websiteUrl: null,
          bannedAt: new Date().toISOString(),
          bannedReason: "Account deleted by user",
        })
        .where(eq(usersTable.id, userId))
        .returning({ id: usersTable.id });
      if (!user) throw new Error("User not found during account deletion");

      for (const [table, ownerColumn, nameColumn] of NAME_COPIES) {
        await tx
          .update(table)
          .set({ [nameColumn]: DELETED_USER_NAME })
          .where(eq(ownerColumn, userId));
      }
    });
    res.sendStatus(204);
  },
);

// GET /users/me/usage
router.get("/users/me/usage", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const { entitlements, isAdmin } = await resolveAccountPlan(userId);
  // Uncapped is an administrator property only; every tier has finite rates.
  const unlimited = isAdmin;
  const result = await pool.query<{ key: string; hits: number }>(
    `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
     FROM rate_limit_hits WHERE key = ANY($1::text[])`,
    [
      [
        "discover-ai-user-day:user:" + userId,
        "deep-user-day:" + userId,
        "deep-user-month:" + userId,
      ],
    ],
  );
  const usage = new Map(result.rows.map((row) => [row.key, Number(row.hits)]));
  const deep = deepAllowance(
    {
      dayUsed: usage.get("deep-user-day:" + userId) ?? 0,
      monthUsed: usage.get("deep-user-month:" + userId) ?? 0,
    },
    entitlements.ai,
    unlimited,
  );
  // Stored-data allowances travel with the AI counters so a client renders the
  // whole plan from one response instead of guessing the half it cannot see.
  const capacity = await accountCapacityReport(userId);
  res.json(
    GetMyUsageResponse.parse({
      plan: isAdmin ? "Administrator" : entitlements.label,
      // The machine-readable tier, so clients never have to parse the label.
      tier: isAdmin ? "administrator" : entitlements.tier,
      unlimited,
      aiSearch: {
        used: usage.get("discover-ai-user-day:user:" + userId) ?? 0,
        limit: unlimited ? null : entitlements.ai.searchPerDay,
        window: "day",
      },
      // Whichever of the two enforced windows the account is actually up
      // against; see lib/deepAllowance.ts for what reporting the wrong one
      // did to paying customers.
      deepResearch: deep,
      capacity: {
        classesOwned: capacity["classes-owned"],
        classMembers: capacity["class-members"],
        studyActivities: capacity["study-activities"],
        resourceLists: capacity["resource-lists"],
        learningGoals: capacity["learning-goals"],
        canvases: capacity.canvases,
      },
    }),
  );
});

// PATCH /users/me
router.patch(
  "/users/me",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const parsed = UpdateMeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    // Strip avatarUrl from PATCH payload, avatar changes must use POST /users/me/avatar
    // (which enforces magic-byte validation). This is defence-in-depth against clients
    // that still send the field after the OpenAPI schema update.
    const { avatarUrl: _dropped, ...safeFields } =
      parsed.data as typeof parsed.data & { avatarUrl?: unknown };
    const [user] = await db
      .update(usersTable)
      .set(safeFields)
      .where(eq(usersTable.id, userId))
      .returning(publicUserColumns);
    res.json(UpdateMeResponse.parse(user));
  },
);

// PATCH /users/me/role
router.patch(
  "/users/me/role",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, accountRole } = req as AuthenticatedRequest;
    const parsed = SwitchRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const [user] = await db
      .update(usersTable)
      .set(
        accountRole === "admin"
          ? { activeRole: parsed.data.role }
          : {
              role: parsed.data.role,
              activeRole: parsed.data.role,
              gradeOrDept: null,
              // Self-service role changes must drop account verification.
              // Without this, anyone could self-promote to teacher, get
              // verified, switch back, and keep verification, which would
              // make every verified submitter's auto-publish trivially
              // forgeable.
              teacherVerified: false,
              verifiedAt: null,
              verifiedById: null,
            },
      )
      .where(eq(usersTable.id, userId))
      .returning(publicUserColumns);
    const token = issueToken(user.id, user.role, user.activeRole);
    res.json(SwitchRoleResponse.parse({ user, token }));
  },
);

// POST /users/me/avatar, multipart upload, stores as base64 data-URL
router.post(
  "/users/me/avatar",
  requireAuth,
  (req, res, next) => {
    avatarUpload.single("file")(req, res, (err) => {
      if (err) {
        // Multer fileFilter rejection or other upload error → 400
        res
          .status(400)
          .json({ error: err instanceof Error ? err.message : "Invalid file" });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }
    // Content-based validation: check magic bytes, ignore client-declared MIME
    const verifiedMime = detectRasterImageMime(req.file.buffer);
    if (!verifiedMime) {
      res
        .status(400)
        .json({ error: "Only PNG, JPEG, and WebP images are accepted" });
      return;
    }
    const dataUrl = `data:${verifiedMime};base64,${req.file.buffer.toString("base64")}`;
    const [user] = await db
      .update(usersTable)
      .set({ avatarUrl: dataUrl })
      .where(eq(usersTable.id, userId))
      .returning(publicUserColumns);
    res.json(UploadAvatarResponse.parse(user));
  },
);

// PUT /users/me/avatar/preset, server-curated SVG avatar, safe for public profiles
router.put(
  "/users/me/avatar/preset",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const parsed = SetPresetAvatarBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const avatarUrl = presetAvatarDataUrl(parsed.data.avatarId);
    if (!avatarUrl) {
      res.status(400).json({ error: "Unknown preset avatar" });
      return;
    }
    const [user] = await db
      .update(usersTable)
      .set({ avatarUrl })
      .where(eq(usersTable.id, userId))
      .returning(publicUserColumns);
    res.json(SetPresetAvatarResponse.parse(user));
  },
);

type PrivacyUser = Pick<
  typeof usersTable.$inferSelect,
  | "id"
  | "name"
  | "role"
  | "avatarUrl"
  | "bio"
  | "subjects"
  | "gradeOrDept"
  | "websiteUrl"
  | "profileVisibility"
  | "showBio"
  | "showSubjects"
  | "showGradeOrDept"
  | "showWebsite"
>;

const privacyUserSelection = {
  id: usersTable.id,
  name: usersTable.name,
  role: usersTable.role,
  avatarUrl: usersTable.avatarUrl,
  bio: usersTable.bio,
  subjects: usersTable.subjects,
  gradeOrDept: usersTable.gradeOrDept,
  websiteUrl: usersTable.websiteUrl,
  profileVisibility: usersTable.profileVisibility,
  showBio: usersTable.showBio,
  showSubjects: usersTable.showSubjects,
  showGradeOrDept: usersTable.showGradeOrDept,
  showWebsite: usersTable.showWebsite,
};

function maskPublicUser(user: PrivacyUser, revealAll = false) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    bio: revealAll || user.showBio ? user.bio : null,
    subjects: revealAll || user.showSubjects ? user.subjects : null,
    gradeOrDept: revealAll || user.showGradeOrDept ? user.gradeOrDept : null,
    websiteUrl: revealAll || user.showWebsite ? user.websiteUrl : null,
  };
}

async function sharesClass(
  firstUserId: number,
  secondUserId: number,
): Promise<boolean> {
  const firstClasses = await db
    .select({ classId: classMembersTable.classId })
    .from(classMembersTable)
    .where(eq(classMembersTable.userId, firstUserId));
  if (!firstClasses.length) return false;
  const [shared] = await db
    .select({ userId: classMembersTable.userId })
    .from(classMembersTable)
    .where(
      and(
        eq(classMembersTable.userId, secondUserId),
        inArray(
          classMembersTable.classId,
          firstClasses.map((item) => item.classId),
        ),
      ),
    )
    .limit(1);
  return !!shared;
}

async function blockedIdsFor(userId: number): Promise<Set<number>> {
  const rows = await db
    .select({
      blockerId: userBlocksTable.blockerId,
      blockedId: userBlocksTable.blockedId,
    })
    .from(userBlocksTable)
    .where(
      or(
        eq(userBlocksTable.blockerId, userId),
        eq(userBlocksTable.blockedId, userId),
      ),
    );
  return new Set(
    rows.map((row) =>
      row.blockerId === userId ? row.blockedId : row.blockerId,
    ),
  );
}

// GET /users/search, shared classmates by default; opt-in profile discovery with scope=all
router.get("/users/search", requireAuth, async (req, res): Promise<void> => {
  const { userId, accountRole } = req as AuthenticatedRequest;
  const isAdmin = accountRole === "admin";
  const parsed = SearchUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const {
    q = "",
    classId,
    scope = "shared",
    role,
    subject = "",
    limit = 24,
    offset = 0,
  } = parsed.data;
  const blockedIds = isAdmin ? new Set<number>() : await blockedIdsFor(userId);
  const searchTerm = q.trim().replace(/\s+/g, " ");
  const subjectTerm = subject.trim();

  if (scope === "all" || isAdmin) {
    const conditions = [ne(usersTable.id, userId)];
    if (!isAdmin)
      conditions.push(eq(usersTable.profileVisibility, "everyone" as const));
    if (role) conditions.push(eq(usersTable.role, role));
    if (searchTerm) {
      const pattern = `%${searchTerm}%`;
      conditions.push(
        or(
          ilike(usersTable.name, pattern),
          and(eq(usersTable.showBio, true), ilike(usersTable.bio, pattern)),
          and(
            eq(usersTable.showGradeOrDept, true),
            ilike(usersTable.gradeOrDept, pattern),
          ),
          and(
            eq(usersTable.showSubjects, true),
            sql`array_to_string(${usersTable.subjects}, ' ') ilike ${pattern}`,
          ),
        )!,
      );
    }
    if (subjectTerm) {
      const pattern = `%${subjectTerm}%`;
      conditions.push(
        or(
          and(
            eq(usersTable.showSubjects, true),
            sql`array_to_string(${usersTable.subjects}, ' ') ilike ${pattern}`,
          ),
          and(eq(usersTable.showBio, true), ilike(usersTable.bio, pattern)),
          and(
            eq(usersTable.showGradeOrDept, true),
            ilike(usersTable.gradeOrDept, pattern),
          ),
        )!,
      );
    }
    const relevance = searchTerm
      ? sql`case when lower(${usersTable.name}) = lower(${searchTerm}) then 0 when lower(${usersTable.name}) like lower(${searchTerm}) || chr(37) then 1 else 2 end`
      : usersTable.name;
    const users = await db
      .select(privacyUserSelection)
      .from(usersTable)
      .where(and(...conditions))
      .orderBy(relevance, usersTable.name)
      .limit(limit)
      .offset(offset);
    res.json(
      users
        .filter((user) => !blockedIds.has(user.id))
        .map((user) => maskPublicUser(user, isAdmin)),
    );
    return;
  }

  const myClasses = await db
    .select({ classId: classMembersTable.classId })
    .from(classMembersTable)
    .where(eq(classMembersTable.userId, userId));
  if (myClasses.length === 0) {
    res.json([]);
    return;
  }
  const classIds = classId
    ? myClasses.map((item) => item.classId).filter((id) => id === classId)
    : myClasses.map((item) => item.classId);
  if (classIds.length === 0) {
    res.json([]);
    return;
  }
  const sharedMemberRows = await db
    .selectDistinct({ userId: classMembersTable.userId })
    .from(classMembersTable)
    .where(
      and(
        inArray(classMembersTable.classId, classIds),
        ne(classMembersTable.userId, userId),
      ),
    );
  if (sharedMemberRows.length === 0) {
    res.json([]);
    return;
  }
  let users = await db
    .select(privacyUserSelection)
    .from(usersTable)
    .where(
      and(
        inArray(
          usersTable.id,
          sharedMemberRows.map((item) => item.userId),
        ),
        ne(usersTable.profileVisibility, "private"),
      ),
    );
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    users = users.filter((user) => user.name.toLowerCase().includes(lower));
  }
  res.json(
    users
      .filter((user) => !blockedIds.has(user.id))
      .slice(offset, offset + limit)
      .map((user) => maskPublicUser(user, isAdmin)),
  );
});

async function usersHaveBlock(
  firstId: number,
  secondId: number,
): Promise<boolean> {
  const [blocked] = await db
    .select({ id: userBlocksTable.id })
    .from(userBlocksTable)
    .where(
      or(
        and(
          eq(userBlocksTable.blockerId, firstId),
          eq(userBlocksTable.blockedId, secondId),
        ),
        and(
          eq(userBlocksTable.blockerId, secondId),
          eq(userBlocksTable.blockedId, firstId),
        ),
      ),
    )
    .limit(1);
  return !!blocked;
}

router.get(
  "/users/:id/safety",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const params = GetUserSafetyStatusParams.safeParse({
      id: Number(req.params.id),
    });
    if (!params.success || params.data.id === userId) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const [row] = await db
      .select({ id: userBlocksTable.id })
      .from(userBlocksTable)
      .where(
        and(
          eq(userBlocksTable.blockerId, userId),
          eq(userBlocksTable.blockedId, params.data.id),
        ),
      )
      .limit(1);
    res.json(GetUserSafetyStatusResponse.parse({ blocked: !!row }));
  },
);

router.put(
  "/users/:id/safety",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const params = BlockUserParams.safeParse({ id: Number(req.params.id) });
    if (!params.success || params.data.id === userId) {
      res.status(400).json({ error: "You cannot block this user" });
      return;
    }
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await db
      .insert(userBlocksTable)
      .values({ blockerId: userId, blockedId: target.id })
      .onConflictDoNothing();
    res.json(BlockUserResponse.parse({ blocked: true }));
  },
);

router.delete(
  "/users/:id/safety",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const params = UnblockUserParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    await db
      .delete(userBlocksTable)
      .where(
        and(
          eq(userBlocksTable.blockerId, userId),
          eq(userBlocksTable.blockedId, params.data.id),
        ),
      );
    res.sendStatus(204);
  },
);

router.post(
  "/users/:id/report",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = req as AuthenticatedRequest;
    const params = ReportUserParams.safeParse({ id: Number(req.params.id) });
    const body = ReportUserBody.safeParse(req.body);
    if (!params.success || !body.success || params.data.id === userId) {
      res.status(400).json({ error: "Invalid report" });
      return;
    }
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await db.insert(userReportsTable).values({
      reporterId: userId,
      reportedId: target.id,
      reason: body.data.reason,
      details: body.data.details?.trim() || null,
    });
    res.status(201).json(ReportUserResponse.parse({ received: true }));
  },
);

// GET /users/:id/library, independently audience-checked user library
router.get(
  "/users/:id/library",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId, accountRole } = req as AuthenticatedRequest;
    const parsed = GetUserLibraryParams.safeParse({
      id: Number(req.params.id),
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const [owner] = await db
      .select({
        id: usersTable.id,
        libraryVisibility: usersTable.libraryVisibility,
        activeRole: usersTable.activeRole,
      })
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.id));
    if (!owner) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const isAdmin = accountRole === "admin";
    if (!isAdmin && owner.id !== userId) {
      if (owner.libraryVisibility === "private") {
        res.status(403).json({ error: "This library is private" });
        return;
      }
      if (
        owner.libraryVisibility === "classmates" &&
        !(await sharesClass(userId, owner.id))
      ) {
        res
          .status(403)
          .json({ error: "This library is visible to classmates only" });
        return;
      }
    }
    // These rows go straight into GetUserLibraryResponse.parse(), whose schema
    // requires avgRating/reviewCount on resources and itemCount on lists. Raw
    // table rows carry none of those, so selecting them bare made this endpoint
    // throw on its own response. Compute the aggregates in SQL (one query each)
    // rather than a round-trip per row.
    const [resources, lists] = await Promise.all([
      db
        .select({
          ...publicResourceColumns,
          avgRating: sql<number>`coalesce((select avg(rating) from reviews where resource_id = resources.id), 0)`,
          reviewCount: sql<number>`cast((select count(*) from reviews where resource_id = resources.id) as int)`,
        })
        .from(resourcesTable)
        .where(
          and(
            eq(resourcesTable.submittedById, owner.id),
            or(
              eq(
                resourcesTable.workspaceRole,
                owner.activeRole as "student" | "teacher",
              ),
              eq(resourcesTable.workspaceRole, "shared"),
            )!,
          ),
        )
        .orderBy(desc(resourcesTable.createdAt)),
      db
        .select({
          id: resourceListsTable.id,
          name: resourceListsTable.name,
          description: resourceListsTable.description,
          ownerId: resourceListsTable.ownerId,
          classId: resourceListsTable.classId,
          workspaceRole: resourceListsTable.workspaceRole,
          createdAt: resourceListsTable.createdAt,
          itemCount: sql<number>`cast((select count(*) from list_items where list_id = resource_lists.id) as int)`,
        })
        .from(resourceListsTable)
        .where(
          and(
            eq(resourceListsTable.ownerId, owner.id),
            or(
              eq(
                resourceListsTable.workspaceRole,
                owner.activeRole as "student" | "teacher",
              ),
              eq(resourceListsTable.workspaceRole, "shared"),
            )!,
          ),
        )
        .orderBy(desc(resourceListsTable.createdAt)),
    ]);
    res.json(
      GetUserLibraryResponse.parse({
        resources: resources.map((resource) => ({
          ...resource,
          avgRating: Math.round(Number(resource.avgRating) * 10) / 10,
        })),
        lists,
      }),
    );
  },
);

// GET /users/:id, audience-checked profile with field-level masking
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId, accountRole } = req as AuthenticatedRequest;
  const parsed = GetPublicProfileParams.safeParse({
    id: Number(req.params.id),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const isAdmin = accountRole === "admin";
  if (user.id !== userId && !isAdmin) {
    if (user.profileVisibility === "private") {
      res.status(403).json({ error: "This profile is private" });
      return;
    }
    if (
      user.profileVisibility === "classmates" &&
      !(await sharesClass(userId, user.id))
    ) {
      res
        .status(403)
        .json({ error: "This profile is visible to classmates only" });
      return;
    }
  }
  res.json(GetPublicProfileResponse.parse(maskPublicUser(user, isAdmin)));
});

export default router;
