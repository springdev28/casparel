/**
 * @fileOverview Web domain role: centralizes Dashboard Truth state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
export interface TeacherLearningSignal {
  concept: string;
  learnerCount: number;
  averageUnderstanding: number;
  stalledCount: number;
  commonMisconception?: string | null;
}

export interface TeacherSignalPresentation {
  concept: string;
  learnerCount: number;
  averageUnderstanding: number;
  stalledCount: number;
  detail: string;
}

/**
 * Only produce educator-facing claims from returned learning evidence. Empty
 * and missing responses intentionally stay empty; demo statistics must never
 * be mistaken for a real class signal.
 */
export function presentTeacherSignals(
  signals: readonly TeacherLearningSignal[] | undefined,
): TeacherSignalPresentation[] {
  return (signals ?? []).map((signal) => ({
    concept: signal.concept,
    learnerCount: signal.learnerCount,
    averageUnderstanding: signal.averageUnderstanding,
    stalledCount: signal.stalledCount,
    detail:
      signal.commonMisconception ??
      `Average understanding: ${signal.averageUnderstanding} of 4`,
  }));
}

export function weakestTeacherSignal(
  signals: readonly TeacherLearningSignal[] | undefined,
): TeacherLearningSignal | null {
  if (!signals?.length) return null;
  return [...signals].sort(
    (left, right) => left.averageUnderstanding - right.averageUnderstanding,
  )[0];
}
