/**
 * @fileOverview Verification role: exercises List Quality behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The facts become sentences here, which is the half a translator can reach.
 *
 * The other half is that this app will one day run against a server that has
 * learned a check it has not. What it must do then is say nothing, rather than
 * print a machine name at somebody deciding what to study next.
 */
import { describe, expect, it } from 'vitest';
import type { ListQualityFinding } from '@workspace/api-client-react';
import { describeFinding, LIST_ITEM_ROLES, roleLabel } from './list-quality';

/** The identity translator: these tests are about the shape, not the words. */
const t = (value: string) => value;

describe('describeFinding', () => {
  it('names the site a list leans on, and how much of it does', () => {
    expect(
      describeFinding(
        { kind: 'one_provider', provider: 'wikipedia.org', count: 4 },
        t,
      ),
    ).toContain('wikipedia.org');
  });

  it('names the format when there is only one', () => {
    expect(
      describeFinding({ kind: 'one_format', format: 'article', count: 5 }, t),
    ).toContain('article');
  });

  it('says a duplicate plainly, without naming rows the reader cannot see', () => {
    expect(
      describeFinding({ kind: 'duplicate_link', resourceIds: [1, 2] }, t),
    ).toBe('The same link is in this list twice.');
  });

  it('counts the items aimed elsewhere and names both levels', () => {
    const sentence = describeFinding(
      {
        kind: 'level_mismatch',
        resourceIds: [7],
        level: 'Undergraduate',
        majority: 'Year 12',
      },
      t,
    );
    expect(sentence).toContain('Undergraduate');
    expect(sentence).toContain('Year 12');
    expect(sentence).toContain('1');
  });

  it('says a labelled list has nothing to practise on', () => {
    expect(describeFinding({ kind: 'no_practice', count: 4 }, t)).toBe(
      'Nothing here is labelled as practice.',
    );
  });

  it('names each role, and names having chosen none', () => {
    expect(roleLabel('practice', t)).toBe('Practice');
    expect(roleLabel(null, t)).toBe('No role');
    // Four to choose from, and the picker offers them in this order.
    expect(LIST_ITEM_ROLES).toEqual(['explanation', 'practice', 'example', 'reference']);
  });

  it('says nothing about a check it has not been taught', () => {
    expect(
      describeFinding(
        { kind: 'prerequisites_missing' } as unknown as ListQualityFinding,
        t,
      ),
    ).toBeNull();
  });
});
