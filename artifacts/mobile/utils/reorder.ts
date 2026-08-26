/**
 * @fileOverview Mobile support role: moves one item within an ordered list without mutating the array it was given.
 * System connection: used by the Learning List screen, whose reorder controls send the whole new order to the API.
 */

/**
 * The order after moving one item up or down.
 *
 * A phone screen has no room for drag handles that a screen reader can also
 * use, and the product contract asks for a non-drag alternative regardless. So
 * reordering is two buttons, and what they need is this: the new order, as a
 * new array, with the original left alone -- because the original is the order
 * to put back if the write fails.
 *
 * A move off either end returns the same order rather than throwing or
 * wrapping around. The buttons are disabled at the ends, so this is the second
 * line rather than the first, and "nothing happened" is the honest outcome of
 * asking to move the first item up.
 */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length) return [...items];
  if (target < 0 || target >= items.length) return [...items];
  const moved = [...items];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}
