/**
 * @fileOverview Pure selection rules for resuming the learner's most recently updated unfinished path.
 * System connection: the mobile dashboard uses these helpers to turn the learning-goal collection into one deterministic continuation card.
 */
import type { LearningGoal, LearningPathStep } from '@workspace/api-client-react';

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Completed goals and goals without an unfinished step cannot provide a useful
 * resume action. Among the remaining goals, updatedAt decides which path owns
 * the dashboard continuation slot.
 */
export function selectResumableGoal(goals: readonly LearningGoal[]): LearningGoal | null {
  return goals.reduce<LearningGoal | null>((selected, goal) => {
    const resumable = goal.status !== 'completed' && goal.pathSteps.some((step) => !step.completed);
    if (!resumable) return selected;
    if (!selected || timestamp(goal.updatedAt) > timestamp(selected.updatedAt)) return goal;
    return selected;
  }, null);
}

export function nextIncompleteStep(goal: LearningGoal): LearningPathStep | null {
  return goal.pathSteps.find((step) => !step.completed) ?? null;
}
