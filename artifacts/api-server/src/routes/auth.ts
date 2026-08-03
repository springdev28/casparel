import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db, usersTable } from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
  RegisterResponse,
  LoginResponse,
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
} from "@workspace/api-zod";
import { hashPassword, verifyPassword, issueToken } from "../lib/auth";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";

const router: IRouter = Router();

// 5 attempts per IP per 15 minutes on auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
});

// POST /auth/register
router.post("/auth/register", authRateLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password, name, role } = parsed.data;
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
  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, userId))
    .returning();
  res.json(UpdateMeResponse.parse(user));
});

export default router;
