import { type Request, type Response, type NextFunction } from "express";
import { decodeToken } from "../lib/auth";

export interface AuthenticatedRequest extends Request {
  userId: number;
  userRole: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = header.slice(7);
  const payload = decodeToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as AuthenticatedRequest).userId = payload.userId;
  (req as AuthenticatedRequest).userRole = payload.role;
  next();
}
