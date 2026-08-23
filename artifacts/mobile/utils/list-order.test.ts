/**
 * @fileOverview Verification role: protects learning-list reorder boundaries and exact item order.
 * System connection: covers the optimistic ordering helper used before the API mutation is sent.
 */
import { describe, expect, it } from 'vitest';
import { moveListItem } from './list-order';

describe('moveListItem', () => {
  it('moves one item without mutating the source list', () => {
    const source = [10, 20, 30];

    expect(moveListItem(source, 1, -1)).toEqual([20, 10, 30]);
    expect(source).toEqual([10, 20, 30]);
  });

  it('rejects moves beyond either boundary', () => {
    expect(moveListItem(['first', 'last'], 0, -1)).toBeNull();
    expect(moveListItem(['first', 'last'], 1, 1)).toBeNull();
  });
});
