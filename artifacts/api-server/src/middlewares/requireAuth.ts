import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { decodeToken } from "../lib/auth";

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

  void db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      activeRole: usersTable.activeRole,
      bannedAt: usersTable.bannedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId))
    .then(([user]) => {
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
      const request = req as AuthenticatedRequest;
      request.userId = user.id;
      request.userRole = user.activeRole ?? user.role;
      request.accountRole = user.role;
      next();
    })
    .catch(next);
}
