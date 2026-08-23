/**
 * @fileOverview Web domain role: centralizes User Preferences state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetUserPreferencesQueryKey,
  getUserPreferences,
  updateUserPreferences,
  type InterfaceColorsPreference as GeneratedInterfaceColorsPreference,
  type UserPreferences as GeneratedUserPreferences,
  type UserPreferencesPatch as GeneratedUserPreferencesPatch,
  type UserPreferencesSearchHistoryItem,
} from "@workspace/api-client-react";

export type InterfaceColorsPreference = GeneratedInterfaceColorsPreference;
export type SearchHistoryPreference = UserPreferencesSearchHistoryItem;
export type UserPreferences = GeneratedUserPreferences;
export type UserPreferencesPatch = GeneratedUserPreferencesPatch;

export const userPreferencesQueryKey = getGetUserPreferencesQueryKey();

export function saveUserPreferences(patch: UserPreferencesPatch) {
  return updateUserPreferences(patch);
}

export function useUserPreferences(enabled = true) {
  return useQuery({
    queryKey: userPreferencesQueryKey,
    queryFn: () => getUserPreferences(),
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
