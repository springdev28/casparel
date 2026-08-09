import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type InterfaceColorsPreference = {
  background: string;
  surface: string;
  primary: string;
  accent: string;
};

export type SearchHistoryPreference = {
  query: string;
  searchedAt: string;
};

export type UserPreferences = {
  userId: number;
  language: "en" | "es" | "fr" | "de" | "pt" | "tr" | null;
  interfaceColors: InterfaceColorsPreference | null;
  ambientStyle:
    | "off"
    | "net"
    | "globe"
    | "halo"
    | "cells"
    | "rings"
    | "topology"
    | null;
  ambientIntensity: number | null;
  readNotificationIds: number[];
  dashboardGoalIds: Record<string, number>;
  continueStudying: Record<string, number[]>;
  pendingCheckIns: Record<string, { concept: string; prompt: string }>;
  searchHistory: SearchHistoryPreference[];
  resourceSearchState: Record<string, unknown> | null;
  allowMessageRequests: boolean;
  updatedAt: string;
};

export type UserPreferencesPatch = Partial<
  Omit<UserPreferences, "userId" | "updatedAt">
>;

export const userPreferencesQueryKey = ["user-preferences"] as const;

async function preferencesRequest<T>(init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("schoolar_token");
  const response = await fetch("/api/users/me/preferences", {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      (payload as { error?: string }).error ?? "Could not save account data",
    );
  return payload as T;
}

export function useUserPreferences(enabled = true) {
  return useQuery({
    queryKey: userPreferencesQueryKey,
    queryFn: () => preferencesRequest<UserPreferences>(),
    enabled,
    staleTime: 30_000,
  });
}

export function useUpdateUserPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserPreferencesPatch) =>
      preferencesRequest<UserPreferences>({
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (preferences) => {
      client.setQueryData(userPreferencesQueryKey, preferences);
    },
  });
}
