import { type Request, type Response, type NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "./requireAuth";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if ((req as AuthenticatedRequest).accountRole !== "admin") {
      res.status(403).json({ error: "Administrator access required" });
      return;
    }
    next();
  });
}
