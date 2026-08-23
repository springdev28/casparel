/**
 * @fileOverview Web domain role: centralizes User Preferences state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/**
 * The account's preferences, from the generated client.
 *
 * This module used to be a hand-written copy of the whole thing: the type, the
 * patch type, a fetch wrapper with its own Authorization header and its own
 * error handling, and React Query hooks around it. Not because anybody chose
 * that -- because /users/me/preferences was not in openapi.yaml, so there was
 * nothing generated to call. The phone app had a second copy of the same
 * workaround for the same reason.
 *
 * A hand-written copy of a schema is a copy that can drift, silently, in the
 * direction of whatever the server changed and nobody updated here. The
 * endpoint is described now, so the types and the calls come from the
 * contract; what stays is the shape the rest of the app already imports.
 *
 * The query key stays a plain constant rather than the generated one, because
 * eight files invalidate against it and its identity is what they rely on.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyPreferences,
  updateMyPreferences,
} from "@workspace/api-client-react";
import type {
  InterfaceColors,
  SearchHistoryEntry,
  UserPreferences,
  UserPreferencesPatch,
} from "@workspace/api-client-react";

/*
 * The names this app has always used for them. Kept as aliases rather than
 * renamed across nine files: the contract's names are the ones that matter,
 * and a rename would be churn in every caller for no reader's benefit.
 */
export type InterfaceColorsPreference = InterfaceColors;
export type SearchHistoryPreference = SearchHistoryEntry;
export type { UserPreferences, UserPreferencesPatch };

export const userPreferencesQueryKey = ["user-preferences"] as const;

export function saveUserPreferences(patch: UserPreferencesPatch) {
  return updateMyPreferences(patch);
}

export function useUserPreferences(enabled = true) {
  return useQuery({
    queryKey: userPreferencesQueryKey,
    queryFn: () => getMyPreferences(),
    enabled,
    staleTime: 30_000,
  });
}

export function useUpdateUserPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveUserPreferences,
    onSuccess: (preferences) => {
      client.setQueryData(userPreferencesQueryKey, preferences);
    },
  });
}
