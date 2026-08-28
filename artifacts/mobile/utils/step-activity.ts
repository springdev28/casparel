/**
 * @fileOverview Mobile support role: turns a step activity suggestion into the sentence and the button a reader sees.
 * System connection: used by the goal screen; the decision comes from the API, the words from here.
 */
import type { StepActivity } from '@workspace/api-client-react';

/**
 * What the next step asks of somebody, in their own language.
 *
 * The server decides which of the five it is, from what the material is and
 * what the learner said it was for. This says it. Two sentences rather than
 * one: what to do, and — when the app has a reason worth admitting — that the
 * reason was their own label rather than the file's format.
 */
export function describeActivity(
  activity: StepActivity,
  t: (value: string) => string,
): { action: string; note: string | null } {
  const action = (() => {
    switch (activity.kind) {
      case 'watch':
        return t('Watch it');
      case 'listen':
        return t('Listen to it');
      case 'practise':
        return t('Work through it');
      case 'find':
        return t('Find something for this');
      case 'read':
      default:
        return t('Read it');
    }
  })();

  // Only the learner's own label is worth explaining. "Because it is a video"
  // tells them what they can already see.
  const note = activity.because === 'role' ? t('You marked this as practice.') : null;
  return { action, note };
}
