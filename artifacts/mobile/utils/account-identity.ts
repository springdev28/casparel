/**
 * Pure account identity rules shared by Android screens.
 *
 * `role` is the authoritative account identity. `activeRole` is only the
 * student/teacher workspace currently being viewed. In particular, an admin
 * in the student workspace is still an Administrator account.
 */

type Translate = (key: string) => string;

export interface AccountIdentity {
  role?: string | null;
  activeRole?: string | null;
}

export type WorkspaceRole = 'student' | 'teacher';

export function workspaceRoleFor(
  account: AccountIdentity | null | undefined,
): WorkspaceRole {
  if (account?.activeRole === 'teacher') return 'teacher';
  if (account?.activeRole === 'student') return 'student';
  return account?.role === 'teacher' ? 'teacher' : 'student';
}

export function isTeacherWorkspace(
  account: AccountIdentity | null | undefined,
): boolean {
  return workspaceRoleFor(account) === 'teacher';
}

export function accountRoleLabel(
  role: string | null | undefined,
  t: Translate,
): string {
  if (role === 'admin') return t('Administrator');
  if (role === 'teacher') return t('Teacher');
  return t('Student');
}

export function workspaceRoleLabel(
  account: AccountIdentity | null | undefined,
  t: Translate,
): string {
  return workspaceRoleFor(account) === 'teacher' ? t('Teacher') : t('Student');
}
