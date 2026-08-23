/**
 * @fileOverview Verification role: protects one-time stale deployment recovery without permitting reload loops.
 * System connection: covers the helper installed by the browser entry point for Vite lazy-chunk failures.
 */
import { describe, expect, it, vi } from 'vitest';
import { recoverStaleChunk } from './chunk-recovery';

describe('recoverStaleChunk', () => {
  it('records and performs the first recovery in a tab session', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const reload = vi.fn();

    expect(recoverStaleChunk(storage, reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect([...values.values()][0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses a second automatic reload and falls back to the error boundary', () => {
    const storage = {
      getItem: () => 'already-attempted',
      setItem: vi.fn(),
    };
    const reload = vi.fn();

    expect(recoverStaleChunk(storage, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('degrades safely when session storage is unavailable', () => {
    const reload = vi.fn();
    expect(
      recoverStaleChunk(
        {
          getItem: () => {
            throw new Error('blocked');
          },
          setItem: vi.fn(),
        },
        reload,
      ),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
