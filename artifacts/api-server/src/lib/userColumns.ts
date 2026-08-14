import { usersTable } from "@workspace/db";

/**
 * The exact user columns the public API contract returns.
 *
 * Always project with this instead of a bare `.select()` / `.returning()` on
 * usersTable. A bare call asks for every column, which:
 *  • selects password_hash for no reason, and
 *  • fails the whole request whenever the schema has a column the deployed
 *    database has not migrated yet, turning a pending migration into a hard
 *    500 on core endpoints like /users/me and role switching.
 */
export const publicUserColumns = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  activeRole: usersTable.activeRole,
  avatarUrl: usersTable.avatarUrl,
  bio: usersTable.bio,
  subjects: usersTable.subjects,
  gradeOrDept: usersTable.gradeOrDept,
  timezone: usersTable.timezone,
  websiteUrl: usersTable.websiteUrl,
  profileVisibility: usersTable.profileVisibility,
  libraryVisibility: usersTable.libraryVisibility,
  showBio: usersTable.showBio,
  showSubjects: usersTable.showSubjects,
  showGradeOrDept: usersTable.showGradeOrDept,
  showWebsite: usersTable.showWebsite,
  createdAt: usersTable.createdAt,
} as const;
