import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { db, usersTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { hashPassword, verifyPassword, issueToken } from "../lib/auth";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import { buildRateLimitStore } from "../lib/rateLimitStore";

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

// GET /users/:id — public profile (requires auth, returns safe subset)
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetPublicProfileParams.safeParse({ id: Number(req.params.id) });
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
  res.json(
    GetPublicProfileResponse.parse({
      id: user.id,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      subjects: user.subjects,
      gradeOrDept: user.gradeOrDept,
    }),
  );
});

export default router;
