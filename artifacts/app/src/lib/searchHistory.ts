/**
 * @fileOverview Web domain role: centralizes Search History state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/** Filter values as stored: primitives only, so they survive a round trip. */
export type SearchHistoryFilters = Record<string, string | number | boolean>;

export interface SearchHistoryItem {
  query: string;
  searchedAt: string;
  /**
   * The filters the search ran with. Optional because entries recorded before
   * this existed have none, and a chip without them falls back to whatever the
   * controls currently say rather than pretending it knows.
   */
  filters?: SearchHistoryFilters;
}

const MAX_SEARCHES = 12;

/**
 * Only the filters that were actually set, and only within the bounds the API
 * accepts — an empty string or a false switch is the default, and storing it
 * would just fill the entry with noise.
 */
function storableFilters(filters: SearchHistoryFilters): SearchHistoryFilters {
  const stored: SearchHistoryFilters = {};
  for (const [name, value] of Object.entries(filters)) {
    if (value === "" || value === false || value === undefined) continue;
    if (name.length > 40) continue;
    stored[name] = typeof value === "string" ? value.slice(0, 160) : value;
  }
  return stored;
}

function key(userId: number) {
  return `schoolar_search_history_${userId}`;
}

export function getSearchHistory(userId?: number): SearchHistoryItem[] {
  if (!userId) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key(userId)) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is SearchHistoryItem =>
            typeof item?.query === "string" &&
            typeof item?.searchedAt === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function addSearchHistory(
  userId: number,
  query: string,
  filters?: SearchHistoryFilters,
) {
  const normalized = query.trim();
  if (!normalized) return getSearchHistory(userId);
  const next = [
    {
      query: normalized,
      searchedAt: new Date().toISOString(),
      ...(filters ? { filters: storableFilters(filters) } : {}),
    },
    ...getSearchHistory(userId).filter(
      (item) =>
        item.query.toLocaleLowerCase() !== normalized.toLocaleLowerCase(),
    ),
  ].slice(0, MAX_SEARCHES);
  localStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}

export function deleteSearchHistory(userId: number, query: string) {
  const next = getSearchHistory(userId).filter((item) => item.query !== query);
  localStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}
