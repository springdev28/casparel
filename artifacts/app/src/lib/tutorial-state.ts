/**
 * @fileOverview Web domain role: validates and serializes resumable product-tutorial progress.
 * System connection: TutorialPage persists only this small local draft before handing the user into real resource search.
 */
export const TUTORIAL_DRAFT_KEY = "casparel_tutorial_draft_v2";
export const TUTORIAL_STEP_COUNT = 3;

export type TutorialDraft = {
  step: number;
  learningNeed: string;
};

export const EMPTY_TUTORIAL_DRAFT: TutorialDraft = {
  step: 0,
  learningNeed: "",
};

/**
 * Local storage can outlive several app versions and can be edited manually.
 * Reject the whole payload unless every field is safe for the current flow.
 */
export function parseTutorialDraft(raw: string | null): TutorialDraft {
  if (!raw) return EMPTY_TUTORIAL_DRAFT;
  try {
    const value = JSON.parse(raw) as { step?: unknown; learningNeed?: unknown };
    if (
      !Number.isSafeInteger(value.step) ||
      (value.step as number) < 0 ||
      (value.step as number) >= TUTORIAL_STEP_COUNT ||
      typeof value.learningNeed !== "string" ||
      value.learningNeed.length > 300
    ) {
      return EMPTY_TUTORIAL_DRAFT;
    }
    return { step: value.step as number, learningNeed: value.learningNeed };
  } catch {
    return EMPTY_TUTORIAL_DRAFT;
  }
}

export function tutorialProgressPercent(step: number): number {
  const boundedStep = Math.max(0, Math.min(TUTORIAL_STEP_COUNT - 1, step));
  return Math.round(((boundedStep + 1) / TUTORIAL_STEP_COUNT) * 100);
}
