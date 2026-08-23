/**
 * @fileOverview API boundary role: provides the Require Admin Express middleware used before protected handlers run.
 * System connection: route modules compose this middleware to establish a trusted request identity or authorization decision.
 */
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
