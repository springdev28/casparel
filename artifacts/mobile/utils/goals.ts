/**
 * @fileOverview Mobile support role: orders learning goals the way every screen that lists them needs.
 * System connection: used by the goals screen and by the post-save sheet, so the two cannot disagree about which goal comes first.
 */
import type { LearningGoal } from '@workspace/api-client-react';

/** Active before paused before completed; newest movement first inside each. */
const STATUS_ORDER: Record<string, number> = {
  active: 0,
  paused: 1,
  completed: 2,
};

/**
 * A finished goal is worth keeping -- it is the evidence you finished
 * something -- but it is not what somebody scanning a list is looking for, and
 * on the save sheet it is certainly not what they mean to attach a resource
 * to. An unknown status sorts last rather than first: a status this app has
 * not been taught about should not push the goal somebody is working on down
 * the screen.
 */
export function byUrgency(a: LearningGoal, b: LearningGoal) {
  const byStatus = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
  if (byStatus !== 0) return byStatus;
  return String(b.updatedAt).localeCompare(String(a.updatedAt));
}
