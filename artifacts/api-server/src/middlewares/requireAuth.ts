/**
 * @fileOverview API boundary role: provides the Require Auth Express middleware used before protected handlers run.
 * System connection: route modules compose this middleware to establish a trusted request identity or authorization decision.
 */
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { decodeToken } from "../lib/auth";
import { isAllowlistedAdminEmail } from "../lib/adminAccess";
import {
  hasBuiltInGeneralProAccess,
  PLAN_PRO,
} from "../lib/entitlements";

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
      plan: usersTable.plan,
      planExpiresAt: usersTable.planExpiresAt,
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

  // Keep built-in account grants reconciled on any authenticated request, not
  // just at login, otherwise a long-lived session can keep stale access until
  // the user happens to sign in again. The write happens only when needed.
  let accountRole = user.role;
  const accountUpdates: {
    role?: "admin";
    plan?: typeof PLAN_PRO;
    planExpiresAt?: null;
  } = {};
  if (accountRole !== "admin" && user.email && isAllowlistedAdminEmail(user.email)) {
    accountUpdates.role = "admin";
  }
  if (
    user.email &&
    hasBuiltInGeneralProAccess(user.email) &&
    (user.plan !== PLAN_PRO || user.planExpiresAt !== null)
  ) {
    accountUpdates.plan = PLAN_PRO;
    accountUpdates.planExpiresAt = null;
  }
  if (Object.keys(accountUpdates).length > 0) {
    await db
      .update(usersTable)
      .set(accountUpdates)
      .where(eq(usersTable.id, user.id));
    if (accountUpdates.role) accountRole = accountUpdates.role;
  }

  const request = req as AuthenticatedRequest;
  request.userId = user.id;
  request.userRole = user.activeRole ?? user.role;
  request.accountRole = accountRole;
  next();
}
