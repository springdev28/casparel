/**
 * @fileOverview Verification role: exercises Goals behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The order two screens now share.
 *
 * The goals screen sorted its own list and the save sheet needed the same
 * order for a different reason: the goal somebody is working on has to be the
 * one under their thumb when they attach a resource, not a goal they finished
 * in March. Sharing the comparator is what keeps the two from drifting, and
 * this is what it promises.
 */
import { describe, expect, it } from 'vitest';
import type { LearningGoal } from '@workspace/api-client-react';
import { byUrgency } from './goals';

function goal(partial: Partial<LearningGoal> & { id: number }): LearningGoal {
  return {
    userId: 1,
    title: `Goal ${partial.id}`,
    subject: 'Physics',
    level: 'beginner',
    status: 'active',
    pathSteps: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as LearningGoal;
}

const order = (goals: LearningGoal[]) =>
  [...goals].sort(byUrgency).map((item) => item.id);

describe('byUrgency', () => {
  it('puts what is being worked on first and what is finished last', () => {
    expect(
      order([
        goal({ id: 1, status: 'completed' }),
        goal({ id: 2, status: 'paused' }),
        goal({ id: 3, status: 'active' }),
      ]),
    ).toEqual([3, 2, 1]);
  });

  it('breaks a tie on which goal moved most recently', () => {
    expect(
      order([
        goal({ id: 1, updatedAt: '2026-03-01T00:00:00.000Z' }),
        goal({ id: 2, updatedAt: '2026-08-01T00:00:00.000Z' }),
        goal({ id: 3, updatedAt: '2026-05-01T00:00:00.000Z' }),
      ]),
    ).toEqual([2, 3, 1]);
  });

  it('sorts a status it has never heard of last, not first', () => {
    expect(
      order([
        goal({ id: 1, status: 'archived' as LearningGoal['status'] }),
        goal({ id: 2, status: 'completed' }),
        goal({ id: 3, status: 'active' }),
      ]),
    ).toEqual([3, 2, 1]);
  });
});
