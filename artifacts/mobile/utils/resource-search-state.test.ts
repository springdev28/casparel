/**
 * @fileOverview Verification role: protects mobile search restoration and non-destructive merging with web search preferences.
 * System connection: covers the pure state contract used before ResourcesScreen reads or writes synchronized preferences.
 */
import { describe, expect, it } from 'vitest';
import {
  mergeMobileResourceQuery,
  mobileResourceQuery,
  storedMobileResourceQuery,
} from './resource-search-state';

describe('mobile resource search state', () => {
  it('restores mobile state and falls back to a compatible web input', () => {
    expect(mobileResourceQuery({ mobileQuery: 'kinematics', inputValue: 'waves' })).toBe('kinematics');
    expect(mobileResourceQuery({ inputValue: 'waves' })).toBe('waves');
    expect(storedMobileResourceQuery('{"mobileQuery":"forces"}')).toBe('forces');
  });

  it('rejects malformed or oversized stored values', () => {
    expect(storedMobileResourceQuery('not-json')).toBeNull();
    expect(mobileResourceQuery({ mobileQuery: 'x'.repeat(301) })).toBeNull();
  });

  it('updates the mobile query without deleting web-owned search fields', () => {
    expect(
      mergeMobileResourceQuery(
        { inputValue: 'old', activeQuery: 'old', results: [{ id: 1 }] },
        'new mobile query',
      ),
    ).toEqual({
      inputValue: 'old',
      activeQuery: 'old',
      results: [{ id: 1 }],
      mobileQuery: 'new mobile query',
    });
  });
});
