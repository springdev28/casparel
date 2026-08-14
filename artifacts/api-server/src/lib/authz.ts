/**
 * Authorization helpers, ownership and membership checks.
 * All helpers return true if the check passes, false otherwise.
 * Route handlers should respond 403 when a check fails.
 */
import { eq, and, or } from "drizzle-orm";
import {
  db,
  classesTable,
  classMembersTable,
  resourcesTable,
  reviewsTable,
  resourceListsTable,
  listItemsTable,
  scheduleBlocksTable,
  usersTable,
} from "@workspace/db";

/**
 * User is the teacher who created this class AND their current DB role is "teacher".
 * Checks the live account role first, a user who has switched to student cannot
 * perform teacher actions on their existing classes, even with an old teacher JWT.
 */
export async function isClassTeacher(classId: number, userId: number): Promise<boolean> {
  // Verify live DB role so downgraded accounts cannot retain teacher privileges.
  const [user] = await db
    .select({ role: usersTable.role, activeRole: usersTable.activeRole })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return false;
  // Administrators can inspect and manage every class, including private
  // member notes, even when previewing the student or teacher workspace.
  if (user.role === "admin") return true;
  const effectiveRole = user.activeRole ?? user.role;
  // Teachers retain management access only to classes they own and only while
  // using the teacher workspace.
  if (user.role !== "teacher" || effectiveRole !== "teacher") return false;

  const [cls] = await db
    .select()
    .from(classesTable)
    .where(and(eq(classesTable.id, classId), eq(classesTable.teacherId, userId)));
  return !!cls;
}

/** User is any member of this class (including teacher) */
export async function isClassMember(classId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select()
    .from(classMembersTable)
    .where(and(eq(classMembersTable.classId, classId), eq(classMembersTable.userId, userId)));
  return !!row;
}

/** User submitted this resource */
export async function isResourceOwner(resourceId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select()
    .from(resourcesTable)
    .where(and(eq(resourcesTable.id, resourceId), eq(resourcesTable.submittedById, userId)));
  return !!row;
}

/** User owns this review */
export async function isReviewOwner(reviewId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select()
    .from(reviewsTable)
    .where(and(eq(reviewsTable.id, reviewId), eq(reviewsTable.userId, userId)));
  return !!row;
}

/** User owns this list */
export async function isListOwner(listId: number, userId: number, workspaceRole: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(resourceListsTable)
    .where(and(eq(resourceListsTable.id, listId), eq(resourceListsTable.ownerId, userId), or(eq(resourceListsTable.workspaceRole, workspaceRole as "student" | "teacher"), eq(resourceListsTable.workspaceRole, "shared"))!));
  return !!row;
}

/**
 * User can read this list: either they own it, or it is shared to a class
 * they are a member of.
 */
export async function canReadList(listId: number, userId: number, workspaceRole: string): Promise<boolean> {
  const [list] = await db
    .select()
    .from(resourceListsTable)
    .where(eq(resourceListsTable.id, listId));
  if (!list) return false;
  if (list.ownerId === userId) return list.workspaceRole === workspaceRole || list.workspaceRole === "shared";
  if (list.classId !== null) return isClassMember(list.classId, userId);
  return false;
}

/** User owns this schedule block */
export async function isScheduleBlockOwner(blockId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select()
    .from(scheduleBlocksTable)
    .where(and(eq(scheduleBlocksTable.id, blockId), eq(scheduleBlocksTable.userId, userId)));
  return !!row;
}

/** User owns a list item (via owning the parent list) */
export async function isListItemOwner(itemId: number, userId: number, workspaceRole: string): Promise<boolean> {
  const [item] = await db
    .select()
    .from(listItemsTable)
    .where(eq(listItemsTable.id, itemId));
  if (!item) return false;
  return isListOwner(item.listId, userId, workspaceRole);
}
