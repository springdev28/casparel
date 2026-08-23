/**
 * @fileOverview Verification role: exercises mobile saved-resource identity and guards reload-safe Save state.
 * System connection: runs in the mobile Vitest suite beside the resource detail and Learning List flow.
 */
import { describe, expect, it } from 'vitest';
import type { Resource } from '@workspace/api-client-react';
import { comparableLibraryUrl, findSavedResource } from './resource-library';

const resource = (id: number, url: string): Resource => ({
  id,
  url,
  title: `Resource ${id}`,
  format: 'article',
  subject: 'Physics',
  gradeLevel: 'Year 12',
  submittedById: 7,
  avgRating: 0,
  reviewCount: 0,
  createdAt: '2026-08-23T00:00:00.000Z',
});

describe('mobile library resource identity', () => {
  it('ignores harmless case, whitespace, and trailing-slash differences', () => {
    expect(comparableLibraryUrl(' HTTPS://Example.org/Lesson/ ')).toBe('https://example.org/lesson');
  });

  it('finds the learner-owned row rather than returning the catalogue row', () => {
    const saved = resource(22, 'https://example.org/lesson/');
    expect(findSavedResource([saved], 'https://EXAMPLE.org/lesson')?.id).toBe(22);
  });

  it('does not report a different source as saved', () => {
    expect(findSavedResource([resource(22, 'https://example.org/other')], 'https://example.org/lesson')).toBeUndefined();
  });
});
