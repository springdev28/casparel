/**
 * @fileOverview Verification role: exercises Step Activity behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The five things a step can ask for, said in words.
 *
 * The half worth testing is what it declines to explain: telling somebody a
 * video is to be watched "because it is a video" spends a line of a phone
 * screen on what they can already see. Their own label is the only reason that
 * tells them something.
 */
import { describe, expect, it } from 'vitest';
import type { StepActivity } from '@workspace/api-client-react';
import { describeActivity } from './step-activity';

const t = (value: string) => value;
const activity = (partial: Partial<StepActivity>): StepActivity =>
  ({ kind: 'read', because: 'format', ...partial }) as StepActivity;

describe('describeActivity', () => {
  it('says what to do with each kind', () => {
    expect(describeActivity(activity({ kind: 'watch' }), t).action).toBe('Watch it');
    expect(describeActivity(activity({ kind: 'listen' }), t).action).toBe('Listen to it');
    expect(describeActivity(activity({ kind: 'practise' }), t).action).toBe('Work through it');
    expect(describeActivity(activity({ kind: 'read' }), t).action).toBe('Read it');
    expect(describeActivity(activity({ kind: 'find' }), t).action).toBe(
      'Find something for this',
    );
  });

  it('explains itself only when the reason is the learner’s own', () => {
    expect(
      describeActivity(activity({ kind: 'practise', because: 'role' }), t).note,
    ).toBe('You marked this as practice.');
    expect(describeActivity(activity({ kind: 'watch', because: 'format' }), t).note).toBeNull();
    expect(
      describeActivity(activity({ kind: 'find', because: 'no_resource' }), t).note,
    ).toBeNull();
  });

  it('falls back to reading for a kind it has not been taught', () => {
    expect(
      describeActivity(activity({ kind: 'hologram' as StepActivity['kind'] }), t).action,
    ).toBe('Read it');
  });
});
