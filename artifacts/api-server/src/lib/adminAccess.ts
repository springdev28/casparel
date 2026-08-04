import type { Request } from "express";
import { decodeToken } from "./auth";

export function isAdminRequest(req: Request): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  return (decodeToken(header.slice(7))?.accountRole ?? decodeToken(header.slice(7))?.role) === "admin";
}

export function isAllowlistedAdminEmail(email: string): boolean {
  const builtInAdmins = ["baharyuksel0403@gmail.com"];
  const configured = [builtInAdmins.join(","), process.env.ADMIN_EMAILS ?? ""].filter(Boolean).join(",");
  const allowed = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
