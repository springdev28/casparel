import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { setBaseUrl } from '@workspace/api-client-react';
import { adPreferencesQueryKey, adPreferencesQueryOptions } from './ad-preferences-query';

const saved = { adsDisabled: true, soundMuted: true };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  setBaseUrl('https://casparel.example');
  client = new QueryClient();
});
afterEach(() => {
  client.clear();
  setBaseUrl(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('recovering account ad preferences', () => {
  it('retries a failed first request and keeps the saved Disable ads choice', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ message: 'unavailable' }, 503))
      .mockResolvedValueOnce(response({ adPreferences: saved }));
    vi.stubGlobal('fetch', fetch);
    const pending = client.fetchQuery(adPreferencesQueryOptions(7, 'session-a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(client.getQueryData(adPreferencesQueryKey(7))).toBeUndefined();
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual({ userId: 7, ...saved });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers.get('authorization')).toBe('Bearer session-a');
  });

  it('aborts a hung request so a retry can recover', async () => {
    let aborted = false;
    const fetch = vi.fn()
      .mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      }))
      .mockResolvedValueOnce(response({ adPreferences: saved }));
    vi.stubGlobal('fetch', fetch);
    const pending = client.fetchQuery(adPreferencesQueryOptions(7, 'session-a'));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(aborted).toBe(true);
    expect(await pending).toEqual({ userId: 7, ...saved });
  });

  it('cancels the previous account request and keeps account answers separate', async () => {
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      }))
      .mockResolvedValueOnce(response({ adPreferences: saved })));
    const oldRequest = client.fetchQuery(adPreferencesQueryOptions(7, 'session-a')).catch(() => null);
    await client.cancelQueries({ queryKey: adPreferencesQueryKey(7) });
    await oldRequest;
    expect(aborted).toBe(true);
    expect(await client.fetchQuery(adPreferencesQueryOptions(8, 'session-b'))).toEqual({ userId: 8, ...saved });
    expect(client.getQueryData(adPreferencesQueryKey(7))).toBeUndefined();
    expect(JSON.stringify(client.getQueryCache().getAll().map(query => query.queryKey))).not.toContain('session-');
  });

  it.each([401, 403])('does not repeatedly retry rejected credentials (%s)', async (status) => {
    const fetch = vi.fn().mockResolvedValue(response({ message: 'denied' }, status));
    vi.stubGlobal('fetch', fetch);
    await expect(client.fetchQuery(adPreferencesQueryOptions(7, 'session-a'))).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(adPreferencesQueryKey(7))).toBeUndefined();
  });

  it('never substitutes permission to show ads for a malformed server answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(response({ adPreferences: {} }))));
    const pending = client.fetchQuery(adPreferencesQueryOptions(7, 'session-a'));
    const rejected = expect(pending).rejects.toThrow('AD_PREFERENCES_INVALID_RESPONSE');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(client.getQueryData(adPreferencesQueryKey(7))).toBeUndefined();
  });
});
