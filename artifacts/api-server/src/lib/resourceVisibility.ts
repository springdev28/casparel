/**
 * @fileOverview Backend domain role: centralizes Resource Visibility logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import type { Request } from "express";
import { eq, or, type SQL } from "drizzle-orm";
import { resourcesTable } from "@workspace/db";
import { decodeToken } from "./auth";
import { isAdminRequest } from "./adminAccess";

/**
 * Who is allowed to see an unverified resource.
 *
 * Rejected and not-yet-reviewed submissions are hidden from public listings , 
 * that is the point of the review queue. Two exceptions:
 *  • admins see everything, so the queue and moderation views still work, and
 *  • authors keep seeing their own submissions. Without that, a resource a user
 *    just saved would vanish from their library, read as a bug, and get saved
 *    again, creating duplicates instead of protecting anyone.
 *
 * Returns `undefined` when no filtering applies, which Drizzle treats as "no
 * condition", safe to spread into an existing condition list.
 */
export function resourceVisibilityCondition(
  viewerId: number | null,
  isAdmin: boolean,
): SQL | undefined {
  if (isAdmin) return undefined;
  const verified = eq(resourcesTable.verificationStatus, "verified");
  if (viewerId === null) return verified;
  return or(verified, eq(resourcesTable.submittedById, viewerId));
}

/**
 * Read the viewer from an optional Authorization header.
 *
 * Several resource routes are public but personalise when a token is present.
 * This is the same decode those routes already do inline, in one place.
 */
export function optionalViewerId(req: Request): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return decodeToken(header.slice(7))?.userId ?? null;
  } catch {
    return null;
  }
}

/** Convenience: the visibility condition for a request with optional auth. */
export function visibilityForRequest(req: Request): SQL | undefined {
  return resourceVisibilityCondition(optionalViewerId(req), isAdminRequest(req));
}
