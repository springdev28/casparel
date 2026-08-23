/**
 * @fileOverview Backend domain role: centralizes Resource Columns logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import { resourcesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

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
} as const;

/**
 * Moderation feedback is private to the submitter and administrators. Public
 * catalog/detail responses, classmates, and public list recipients must never
 * receive it merely because they can read the resource itself.
 */
export function resourceColumnsForViewer(
  viewerId: number | null,
  isAdmin: boolean,
) {
  return {
    ...publicResourceColumns,
    verificationNote: isAdmin
      ? resourcesTable.verificationNote
      : viewerId === null
        ? sql<string | null>`null::text`
        : sql<string | null>`case when ${resourcesTable.submittedById} = ${viewerId} then ${resourcesTable.verificationNote} else null end`,
  } as const;
}
