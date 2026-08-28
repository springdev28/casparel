/**
 * @fileOverview Mobile support role: turns a list-quality finding into the sentence a reader sees, in their own language.
 * System connection: used by the Learning List screen; the facts come from the API, the words from here.
 */
import type { ListItemRole, ListQualityFinding } from '@workspace/api-client-react';

/**
 * The roles a learner can give an item, in the order a picker offers them.
 *
 * Four, kept few enough to choose on a phone without a scroll and distinct
 * enough to be worth choosing between. The words come from the dictionaries
 * like any other, so a reader picks in their own language.
 */
export const LIST_ITEM_ROLES: ListItemRole[] = [
  'explanation',
  'practice',
  'example',
  'reference',
];

/** The label for a role, or for having chosen none. */
export function roleLabel(
  role: ListItemRole | null | undefined,
  t: (value: string) => string,
): string {
  switch (role) {
    case 'explanation':
      return t('Explanation');
    case 'practice':
      return t('Practice');
    case 'example':
      return t('Example');
    case 'reference':
      return t('Reference');
    default:
      return t('No role');
  }
}

/**
 * A finding is a fact with numbers on it; this is where it becomes a sentence.
 *
 * The server sends `{ kind: "one_provider", provider: "wikipedia.org", count: 3 }`
 * rather than English, precisely so that this can happen per reader: a sentence
 * built on the server could only ever be in one language, and this app's
 * dictionaries are keyed on the exact English string.
 *
 * Returns null for a kind this build has not been taught, which is the honest
 * answer for a server that is newer than the app: showing nothing beats showing
 * "one_provider" to somebody deciding what to study.
 */
export function describeFinding(
  finding: ListQualityFinding,
  t: (value: string) => string,
): string | null {
  switch (finding.kind) {
    case 'one_provider':
      return `${finding.count} ${t('of these come from one site:')} ${finding.provider}`;
    case 'one_format':
      return `${t('Everything here is the same kind of material:')} ${finding.format}`;
    case 'duplicate_link':
      return t('The same link is in this list twice.');
    case 'level_mismatch':
      return `${finding.resourceIds?.length ?? 0} ${t('are aimed at')} ${finding.level}, ${t('and the rest at')} ${finding.majority}`;
    case 'no_practice':
      return t('Nothing here is labelled as practice.');
    default:
      return null;
  }
}
