/**
 * @fileOverview Web domain role: centralizes Collection Load State state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
export type CollectionLoadState = "loading" | "error" | "empty" | "ready";

interface CollectionQueryState<T> {
  data: readonly T[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Keep request failures distinct from legitimate empty collections.
 * React Query can retain stale data after a background refetch fails, so
 * existing items remain usable while the page surfaces a separate warning.
 */
export function getCollectionLoadState<T>({
  data,
  isLoading,
  isError,
}: CollectionQueryState<T>): CollectionLoadState {
  if (isLoading && data === undefined) return "loading";
  if (isError && data === undefined) return "error";
  if (!data || data.length === 0) return "empty";
  return "ready";
}
