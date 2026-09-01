import { describe, expect, it } from 'vitest';
import {
  accountRoleLabel,
  isTeacherWorkspace,
  workspaceRoleFor,
} from './account-identity';

const t = (value: string) => value;

describe('mobile account identity', () => {
  it('keeps Administrator as the authoritative account label', () => {
    expect(accountRoleLabel('admin', t)).toBe('Administrator');
  });

  it('uses activeRole for an administrator workspace', () => {
    expect(workspaceRoleFor({ role: 'admin', activeRole: 'teacher' })).toBe('teacher');
    expect(isTeacherWorkspace({ role: 'admin', activeRole: 'teacher' })).toBe(true);
    expect(workspaceRoleFor({ role: 'admin', activeRole: 'student' })).toBe('student');
  });

  it('falls back safely for sessions created before activeRole existed', () => {
    expect(workspaceRoleFor({ role: 'teacher' })).toBe('teacher');
    expect(workspaceRoleFor({ role: 'student' })).toBe('student');
    expect(workspaceRoleFor({ role: 'admin' })).toBe('student');
  });
});
