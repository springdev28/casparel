/**
 * @fileOverview Verification role: protects deterministic dashboard path resumption and next-step selection.
 * System connection: covers the pure learning-path rules used by the mobile dashboard continuation card.
 */
import { describe, expect, it } from 'vitest';
import type { LearningGoal } from '@workspace/api-client-react';
import { nextIncompleteStep, selectResumableGoal } from './learning-path';

function goal(overrides: Partial<LearningGoal>): LearningGoal {
  return {
    id: 1,
    userId: 10,
    title: 'Path',
    subject: 'Biology',
    level: 'beginner',
    status: 'active',
    pathSteps: [{ id: 'one', title: 'First', query: 'first', completed: false }],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('learning-path continuation', () => {
  it('selects the most recently updated goal that still has unfinished work', () => {
    const completed = goal({ id: 1, status: 'completed', updatedAt: '2026-08-23T00:00:00.000Z' });
    const older = goal({ id: 2, updatedAt: '2026-08-20T00:00:00.000Z' });
    const newer = goal({ id: 3, updatedAt: '2026-08-22T00:00:00.000Z' });

    expect(selectResumableGoal([completed, newer, older])?.id).toBe(3);
  });

  it('returns the first unfinished step in path order', () => {
    const selected = goal({
      pathSteps: [
        { id: 'one', title: 'First', query: 'first', completed: true },
        { id: 'two', title: 'Second', query: 'second', completed: false },
      ],
    });

    expect(nextIncompleteStep(selected)?.id).toBe('two');
    expect(selectResumableGoal([goal({ pathSteps: [] })])).toBeNull();
  });
});
