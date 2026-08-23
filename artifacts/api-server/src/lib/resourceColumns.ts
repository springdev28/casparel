/**
 * @fileOverview Backend domain role: centralizes Resource Columns logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import { resourcesTable } from "@workspace/db";

/**
 * The resource columns the public API contract returns.
 *
 * Same rule as publicUserColumns: never bare-`.select()` a table whose row is
 * handed to a response. A bare select breaks the endpoint outright the moment
 * the schema gains a column the deployed database has not migrated yet, and
 * quietly widens what leaves the server when columns are added later.
 */
export const publicResourceColumns = {
  id: resourcesTable.id,
  title: resourcesTable.title,
  url: resourcesTable.url,
  description: resourcesTable.description,
  format: resourcesTable.format,
  subject: resourcesTable.subject,
  gradeLevel: resourcesTable.gradeLevel,
  thumbnailUrl: resourcesTable.thumbnailUrl,
  workspaceRole: resourcesTable.workspaceRole,
  submittedById: resourcesTable.submittedById,
  createdAt: resourcesTable.createdAt,
  verificationStatus: resourcesTable.verificationStatus,
  verificationNote: resourcesTable.verificationNote,
} as const;
