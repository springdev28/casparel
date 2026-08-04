import { Router, type IRouter } from "express";
import { eq, and, or, ilike, inArray, ne, sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { db, usersTable, classMembersTable, userBlocksTable, userReportsTable } from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
  RegisterResponse,
  LoginResponse,
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
  SwitchRoleBody,
  SwitchRoleResponse,
  GetPublicProfileParams,
  GetPublicProfileResponse,
  UploadAvatarResponse,
  SetPresetAvatarBody,
  SetPresetAvatarResponse,
  SearchUsersQueryParams,
  GetUserSafetyStatusParams, GetUserSafetyStatusResponse, BlockUserParams, BlockUserResponse, UnblockUserParams, ReportUserParams, ReportUserBody, ReportUserResponse,
} from "@workspace/api-zod";
import { hashPassword, verifyPassword, issueToken } from "../lib/auth";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { buildRateLimitStore } from "../lib/rateLimitStore";

const PRESET_AVATARS: Record<string, { bg: string; accent: string; emoji: string }> = {
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
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\" viewBox=\"0 0 256 256\"><rect width=\"256\" height=\"256\" rx=\"128\" fill=\"" + avatar.bg + "\"/><circle cx=\"128\" cy=\"132\" r=\"94\" fill=\"" + avatar.accent + "\" opacity=\".28\"/><text x=\"128\" y=\"160\" text-anchor=\"middle\" font-size=\"112\">" + avatar.emoji + "</text></svg>";
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

// Multer for avatar upload — 2 MB limit, memory storage.
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
 * when the client claims an image/* MIME type — MIME is client-controlled and
 * cannot be trusted.
 */
function detectRasterImageMime(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF????WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

const router: IRouter = Router();

// 5 attempts per IP per 15 minutes on auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
  store: buildRateLimitStore("auth"),
});

// POST /auth/register
router.post("/auth/register", authRateLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // role is always "student" for new accounts — not client-controlled
  const { email, password, name } = parsed.data;
  const role = "student";
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name, role })
    .returning();
  const token = issueToken(user.id, user.role);
  res.status(201).json(RegisterResponse.parse({ user, token }));
});

// POST /auth/login
router.post("/auth/login", authRateLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = issueToken(user.id, user.role);
  res.json(LoginResponse.parse({ user, token }));
});

// POST /auth/logout
router.post("/auth/logout", (_req, res): void => {
  res.sendStatus(204);
});

// GET /users/me
router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(GetMeResponse.parse(user));
});

// PATCH /users/me
router.patch("/users/me", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Strip avatarUrl from PATCH payload — avatar changes must use POST /users/me/avatar
  // (which enforces magic-byte validation). This is defence-in-depth against clients
  // that still send the field after the OpenAPI schema update.
  const { avatarUrl: _dropped, ...safeFields } = parsed.data as typeof parsed.data & { avatarUrl?: unknown };
  const [user] = await db
    .update(usersTable)
    .set(safeFields)
    .where(eq(usersTable.id, userId))
    .returning();
  res.json(UpdateMeResponse.parse(user));
});

// PATCH /users/me/role
router.patch("/users/me/role", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = SwitchRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ role: parsed.data.role })
    .where(eq(usersTable.id, userId))
    .returning();
  const token = issueToken(user.id, user.role);
  res.json(SwitchRoleResponse.parse({ user, token }));
});

// POST /users/me/avatar — multipart upload, stores as base64 data-URL
router.post(
  "/users/me/avatar",
  requireAuth,
  (req, res, next) => {
    avatarUpload.single("file")(req, res, (err) => {
      if (err) {
        // Multer fileFilter rejection or other upload error → 400
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid file" });
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
      res.status(400).json({ error: "Only PNG, JPEG, and WebP images are accepted" });
      return;
    }
    const dataUrl = `data:${verifiedMime};base64,${req.file.buffer.toString("base64")}`;
    const [user] = await db
      .update(usersTable)
      .set({ avatarUrl: dataUrl })
      .where(eq(usersTable.id, userId))
      .returning();
    res.json(UploadAvatarResponse.parse(user));
  },
);

// PUT /users/me/avatar/preset — server-curated SVG avatar, safe for public profiles
router.put("/users/me/avatar/preset", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = SetPresetAvatarBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const avatarUrl = presetAvatarDataUrl(parsed.data.avatarId);
  if (!avatarUrl) { res.status(400).json({ error: "Unknown preset avatar" }); return; }
  const [user] = await db.update(usersTable).set({ avatarUrl }).where(eq(usersTable.id, userId)).returning();
  res.json(SetPresetAvatarResponse.parse(user));
});

type PrivacyUser = Pick<typeof usersTable.$inferSelect, "id" | "name" | "role" | "avatarUrl" | "bio" | "subjects" | "gradeOrDept" | "websiteUrl" | "profileVisibility" | "showBio" | "showSubjects" | "showGradeOrDept" | "showWebsite">;

const privacyUserSelection = { id: usersTable.id, name: usersTable.name, role: usersTable.role, avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, subjects: usersTable.subjects, gradeOrDept: usersTable.gradeOrDept, websiteUrl: usersTable.websiteUrl, profileVisibility: usersTable.profileVisibility, showBio: usersTable.showBio, showSubjects: usersTable.showSubjects, showGradeOrDept: usersTable.showGradeOrDept, showWebsite: usersTable.showWebsite };

function maskPublicUser(user: PrivacyUser) {
  return { id: user.id, name: user.name, role: user.role, avatarUrl: user.avatarUrl, bio: user.showBio ? user.bio : null, subjects: user.showSubjects ? user.subjects : null, gradeOrDept: user.showGradeOrDept ? user.gradeOrDept : null, websiteUrl: user.showWebsite ? user.websiteUrl : null };
}

async function sharesClass(firstUserId: number, secondUserId: number): Promise<boolean> {
  const firstClasses = await db.select({ classId: classMembersTable.classId }).from(classMembersTable).where(eq(classMembersTable.userId, firstUserId));
  if (!firstClasses.length) return false;
  const [shared] = await db.select({ userId: classMembersTable.userId }).from(classMembersTable).where(and(eq(classMembersTable.userId, secondUserId), inArray(classMembersTable.classId, firstClasses.map((item) => item.classId)))).limit(1);
  return !!shared;
}

async function blockedIdsFor(userId: number): Promise<Set<number>> {
  const rows = await db.select({ blockerId: userBlocksTable.blockerId, blockedId: userBlocksTable.blockedId }).from(userBlocksTable).where(or(eq(userBlocksTable.blockerId, userId), eq(userBlocksTable.blockedId, userId)));
  return new Set(rows.map((row) => row.blockerId === userId ? row.blockedId : row.blockerId));
}

// GET /users/search — shared classmates by default; opt-in profile discovery with scope=all
router.get("/users/search", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = SearchUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q = "", classId, scope = "shared", role, subject = "", limit = 24, offset = 0 } = parsed.data;
  const blockedIds = await blockedIdsFor(userId);
  const searchTerm = q.trim().replace(/\s+/g, " ");
  const subjectTerm = subject.trim();

  if (scope === "all") {
    const conditions = [ne(usersTable.id, userId), eq(usersTable.profileVisibility, "everyone" as const)];
    if (role) conditions.push(eq(usersTable.role, role));
    if (searchTerm) {
      const pattern = `%${searchTerm}%`;
      conditions.push(or(
        ilike(usersTable.name, pattern),
        and(eq(usersTable.showBio, true), ilike(usersTable.bio, pattern)),
        and(eq(usersTable.showGradeOrDept, true), ilike(usersTable.gradeOrDept, pattern)),
        and(eq(usersTable.showSubjects, true), sql`array_to_string(${usersTable.subjects}, ' ') ilike ${pattern}`),
      )!);
    }
    if (subjectTerm) {
      const pattern = `%${subjectTerm}%`;
      conditions.push(or(
        and(eq(usersTable.showSubjects, true), sql`array_to_string(${usersTable.subjects}, ' ') ilike ${pattern}`),
        and(eq(usersTable.showBio, true), ilike(usersTable.bio, pattern)),
        and(eq(usersTable.showGradeOrDept, true), ilike(usersTable.gradeOrDept, pattern)),
      )!);
    }
    const relevance = searchTerm
      ? sql`case when lower(${usersTable.name}) = lower(${searchTerm}) then 0 when lower(${usersTable.name}) like lower(${searchTerm}) || chr(37) then 1 else 2 end`
      : usersTable.name;
    const users = await db.select(privacyUserSelection).from(usersTable).where(and(...conditions)).orderBy(relevance, usersTable.name).limit(limit).offset(offset);
    res.json(users.filter((user) => !blockedIds.has(user.id)).map(maskPublicUser));
    return;
  }

  const myClasses = await db.select({ classId: classMembersTable.classId })
    .from(classMembersTable).where(eq(classMembersTable.userId, userId));
  if (myClasses.length === 0) { res.json([]); return; }
  const classIds = classId
    ? myClasses.map((item) => item.classId).filter((id) => id === classId)
    : myClasses.map((item) => item.classId);
  if (classIds.length === 0) { res.json([]); return; }
  const sharedMemberRows = await db.selectDistinct({ userId: classMembersTable.userId })
    .from(classMembersTable)
    .where(and(inArray(classMembersTable.classId, classIds), ne(classMembersTable.userId, userId)));
  if (sharedMemberRows.length === 0) { res.json([]); return; }
  let users = await db.select(privacyUserSelection)
    .from(usersTable)
    .where(and(inArray(usersTable.id, sharedMemberRows.map((item) => item.userId)), ne(usersTable.profileVisibility, "private")));
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    users = users.filter((user) => user.name.toLowerCase().includes(lower));
  }
  res.json(users.filter((user) => !blockedIds.has(user.id)).slice(offset, offset + limit).map(maskPublicUser));
});

async function usersHaveBlock(firstId: number, secondId: number): Promise<boolean> {
  const [blocked] = await db.select({ id: userBlocksTable.id }).from(userBlocksTable).where(or(
    and(eq(userBlocksTable.blockerId, firstId), eq(userBlocksTable.blockedId, secondId)),
    and(eq(userBlocksTable.blockerId, secondId), eq(userBlocksTable.blockedId, firstId)),
  )).limit(1);
  return !!blocked;
}

router.get("/users/:id/safety", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetUserSafetyStatusParams.safeParse({ id: Number(req.params.id) });
  if (!params.success || params.data.id === userId) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const [row] = await db.select({ id: userBlocksTable.id }).from(userBlocksTable).where(and(eq(userBlocksTable.blockerId, userId), eq(userBlocksTable.blockedId, params.data.id))).limit(1);
  res.json(GetUserSafetyStatusResponse.parse({ blocked: !!row }));
});

router.put("/users/:id/safety", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = BlockUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success || params.data.id === userId) { res.status(400).json({ error: "You cannot block this user" }); return; }
  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  await db.insert(userBlocksTable).values({ blockerId: userId, blockedId: target.id }).onConflictDoNothing();
  res.json(BlockUserResponse.parse({ blocked: true }));
});

router.delete("/users/:id/safety", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UnblockUserParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid user ID" }); return; }
  await db.delete(userBlocksTable).where(and(eq(userBlocksTable.blockerId, userId), eq(userBlocksTable.blockedId, params.data.id)));
  res.sendStatus(204);
});

router.post("/users/:id/report", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = ReportUserParams.safeParse({ id: Number(req.params.id) });
  const body = ReportUserBody.safeParse(req.body);
  if (!params.success || !body.success || params.data.id === userId) { res.status(400).json({ error: "Invalid report" }); return; }
  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  await db.insert(userReportsTable).values({ reporterId: userId, reportedId: target.id, reason: body.data.reason, details: body.data.details?.trim() || null });
  res.status(201).json(ReportUserResponse.parse({ received: true }));
});

// GET /users/:id — audience-checked profile with field-level masking
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = GetPublicProfileParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.id !== userId) {
    if (user.profileVisibility === "private") { res.status(403).json({ error: "This profile is private" }); return; }
    if (user.profileVisibility === "classmates" && !(await sharesClass(userId, user.id))) { res.status(403).json({ error: "This profile is visible to classmates only" }); return; }
  }
  res.json(GetPublicProfileResponse.parse(maskPublicUser(user)));
});

export default router;
