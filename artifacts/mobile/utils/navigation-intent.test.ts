/**
 * @fileOverview Verification role: protects native deep-link intent and rejects unsupported post-login destinations.
 * System connection: covers the route normalization used by the Expo root authentication guard.
 */
import { describe, expect, it } from 'vitest';
import { mobileReturnPath } from './navigation-intent';

describe('mobileReturnPath', () => {
  it('preserves implemented native tabs and detail routes', () => {
    expect(mobileReturnPath('/resources')).toBe('/resources');
    expect(mobileReturnPath('/resource/42')).toBe('/resource/42');
    expect(mobileReturnPath('/class/7')).toBe('/class/7');
    expect(mobileReturnPath('/lists')).toBe('/lists');
    expect(mobileReturnPath('/lists/9')).toBe('/lists/9');
    expect(mobileReturnPath('/lists/9/path-review')).toBe('/lists/9/path-review');
    expect(mobileReturnPath('/goals')).toBe('/goals');
    expect(mobileReturnPath('/goals/3')).toBe('/goals/3');
    expect(mobileReturnPath('/goals/3/study/step_abc-123')).toBe('/goals/3/study/step_abc-123');
    expect(mobileReturnPath('/schedule')).toBe('/schedule');
  });

  it('maps shared plural web detail links to native routes', () => {
    expect(mobileReturnPath('/resources/42')).toBe('/resource/42');
    expect(mobileReturnPath('/classes/7')).toBe('/class/7');
  });

  it('rejects credential, malformed, external-looking, and web-only routes', () => {
    expect(mobileReturnPath('/login')).toBeNull();
    expect(mobileReturnPath('/lists/9/path-review/extra')).toBeNull();
    expect(mobileReturnPath('/goals/not-a-number')).toBeNull();
    expect(mobileReturnPath('/goals/3/study/unsafe%2Fstep')).toBeNull();
    expect(mobileReturnPath('//example.com/resources/42')).toBeNull();
    expect(mobileReturnPath('/resources/not-a-number')).toBeNull();
    expect(mobileReturnPath('/resource/0')).toBeNull();
  });
});
