export interface SearchHistoryItem {
  query: string;
  searchedAt: string;
}

const MAX_SEARCHES = 12;

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

export function addSearchHistory(userId: number, query: string) {
  const normalized = query.trim();
  if (!normalized) return getSearchHistory(userId);
  const next = [
    { query: normalized, searchedAt: new Date().toISOString() },
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
