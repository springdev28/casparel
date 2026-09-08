import { queryOptions } from '@tanstack/react-query';
import { getMyPreferences } from '@workspace/api-client-react';

export interface AccountAdPreferences {
  userId: number;
  adsDisabled: boolean;
  soundMuted: boolean;
}

export const adPreferencesQueryKey = (userId: number | null) =>
  ['native-ad-preferences', userId] as const;

function retryable(error: Error | null): boolean {
  return !(error && 'status' in error &&
    typeof error.status === 'number' && [401, 403].includes(error.status));
}

/** Account-scoped preferences recover from outages without permitting ads early. */
export function adPreferencesQueryOptions(userId: number | null, token: string | null) {
  return queryOptions<AccountAdPreferences>({
    queryKey: adPreferencesQueryKey(userId),
    enabled: userId !== null && token !== null,
    staleTime: 30_000,
    retry: (count, error) => count < 1 && retryable(error),
    // Retry an exhausted request while the app is visible; successful reads
    // stop polling. Native AppState supplies Query's foreground state.
    refetchInterval: (query) =>
      query.state.status === 'error' && retryable(query.state.error) ? 30_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      // Query errors are internal states, never displayed as product copy.
      if (!token || userId === null) throw new Error('AD_PREFERENCES_NO_ACCOUNT');
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const timeout = setTimeout(abort, 10_000);
      try {
        const preferences = await getMyPreferences({
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        const { adPreferences } = preferences;
        if (typeof adPreferences?.adsDisabled !== 'boolean' ||
            typeof adPreferences?.soundMuted !== 'boolean') {
          throw new Error('AD_PREFERENCES_INVALID_RESPONSE');
        }
        return { userId, ...adPreferences };
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
      }
    },
  });
}
