/**
 * @fileOverview Web support role: turns a list-quality finding into the sentence a reader sees.
 * System connection: used by the list detail page; the facts come from the API, the words from here.
 */
import type { ListItemRole, ListQualityFinding } from '@workspace/api-client-react';

/** The roles a learner can give an item, in the order the picker offers them. */
export const LIST_ITEM_ROLES: ListItemRole[] = [
  'explanation',
  'practice',
  'example',
  'reference',
];

/** The label for a role, or for having chosen none. */
export function roleLabel(role: ListItemRole | null | undefined): string {
  switch (role) {
    case 'explanation':
      return 'Explanation';
    case 'practice':
      return 'Practice';
    case 'example':
      return 'Example';
    case 'reference':
      return 'Reference';
    default:
      return 'No role';
  }
}

/**
 * A finding is a fact with numbers on it; this is where it becomes a sentence.
 *
 * The server sends `{ kind: "one_provider", provider: "wikipedia.org", count: 3 }`
 * rather than English, so each client can phrase it for its own reader — here
 * through the translation bridge, which matches whole English strings, so the
 * sentence is assembled from parts it already knows.
 *
 * Returns null for a kind this build has not been taught: a server newer than
 * the app should show nothing rather than "one_provider" to somebody deciding
 * what to study.
 */
export function describeFinding(finding: ListQualityFinding): string | null {
  switch (finding.kind) {
    case 'one_provider':
      return `${finding.count} of these come from one site: ${finding.provider}`;
    case 'one_format':
      return `Everything here is the same kind of material: ${finding.format}`;
    case 'duplicate_link':
      return 'The same link is in this list twice.';
    case 'level_mismatch':
      return `${finding.resourceIds?.length ?? 0} are aimed at ${finding.level}, and the rest at ${finding.majority}`;
    case 'no_practice':
      return 'Nothing here is labelled as practice.';
    default:
      return null;
  }
}
