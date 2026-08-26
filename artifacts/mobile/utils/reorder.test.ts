/**
 * @fileOverview Verification role: exercises Reorder behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * What the move-up and move-down buttons promise.
 *
 * The screen sends the whole new order to the server and puts the old one back
 * if the write fails, so both arrays have to be real and separate. A helper
 * that reordered in place would leave the screen with nothing to restore --
 * the "previous" order would already have been changed underneath it.
 */
import { describe, expect, it } from 'vitest';
import { moveItem } from './reorder';

describe('moveItem', () => {
  it('moves an item up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
  });

  it('moves an item down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('leaves the order alone at either end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the order alone when asked about an item that is not there', () => {
    expect(moveItem(['a', 'b', 'c'], 7, -1)).toEqual(['a', 'b', 'c']);
  });

  it('does not touch the array it was given, so the old order can be restored', () => {
    const original = ['a', 'b', 'c'];
    const moved = moveItem(original, 0, 1);
    expect(original).toEqual(['a', 'b', 'c']);
    expect(moved).not.toBe(original);
  });
});
