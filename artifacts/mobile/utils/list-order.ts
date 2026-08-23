/**
 * @fileOverview Pure list-ordering rules for accessible up/down controls.
 * System connection: LearningListDetailScreen previews a valid move locally, then persists the resulting item-id order through the generated API.
 */

/**
 * Return a reordered copy, or null when the requested move would cross a list
 * boundary. Keeping this rule outside the screen makes optimistic UI behavior
 * deterministic and independently testable.
 */
export function moveListItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] | null {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return null;

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
