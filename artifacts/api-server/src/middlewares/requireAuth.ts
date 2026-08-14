import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { decodeToken } from "../lib/auth";
import { isAllowlistedAdminEmail } from "../lib/adminAccess";

export interface AuthenticatedRequest extends Request {
  userId: number;
  userRole: string;
  accountRole: string;
}

function bannedAccountRouteAllowed(req: Request) {
  const path = req.originalUrl.split("?")[0];
  return (
    (req.method === "GET" &&
      (path.endsWith("/users/me") || path.endsWith("/users/me/access"))) ||
    (req.method === "DELETE" && path.endsWith("/users/me"))
  );
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const payload = decodeToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  void resolveAuthenticatedUser(req, res, next, payload.userId).catch(next);
}

async function resolveAuthenticatedUser(
  req: Request,
  res: Response,
  next: NextFunction,
  userId: number,
): Promise<void> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      activeRole: usersTable.activeRole,
      bannedAt: usersTable.bannedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (user.bannedAt && !bannedAccountRouteAllowed(req)) {
    res.status(423).json({
      error: "This account has been banned",
      code: "ACCOUNT_BANNED",
    });
    return;
  }

  // Keep allowlisted admins promoted on any authenticated request, not just at
  // login — otherwise a long-lived session keeps its stale non-admin role until
  // the user happens to sign in again. The write happens at most once.
  let accountRole = user.role;
  if (accountRole !== "admin" && user.email && isAllowlistedAdminEmail(user.email)) {
    const [promoted] = await db
      .update(usersTable)
      .set({ role: "admin" })
      .where(eq(usersTable.id, user.id))
      .returning({ role: usersTable.role });
    if (promoted?.role) accountRole = promoted.role;
  }

  const request = req as AuthenticatedRequest;
  request.userId = user.id;
  request.userRole = user.activeRole ?? user.role;
  request.accountRole = accountRole;
  next();
}
