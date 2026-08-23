/**
 * @fileOverview Pure parsing and merge rules for the mobile resource-search preference.
 * System connection: ResourcesScreen combines this with platform-safe storage and the synchronized user-preferences API without deleting web search fields.
 */

export const MOBILE_RESOURCE_SEARCH_STORAGE_KEY = 'casparel_mobile_resource_search';
const MAX_QUERY_LENGTH = 300;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validQuery(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_QUERY_LENGTH ? value : null;
}

/** Mobile state wins; a compatible web input is a useful cross-client fallback. */
export function mobileResourceQuery(value: unknown): string | null {
  const state = record(value);
  if (!state) return null;
  return validQuery(state.mobileQuery) ?? validQuery(state.inputValue);
}

export function storedMobileResourceQuery(value: string | null): string | null {
  if (value === null) return null;
  try {
    return mobileResourceQuery(JSON.parse(value));
  } catch {
    return null;
  }
}

/** Preserve fields owned by web discovery while updating only mobileQuery. */
export function mergeMobileResourceQuery(value: unknown, query: string): Record<string, unknown> {
  const state = record(value) ?? {};
  return { ...state, mobileQuery: query.slice(0, MAX_QUERY_LENGTH) };
}
