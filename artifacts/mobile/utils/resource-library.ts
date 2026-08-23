/**
 * @fileOverview Mobile support role: matches catalogue resources to the signed-in learner's saved library.
 * System connection: keeps save state consistent between resource cards, detail actions, and the user-library API.
 */
import type { Resource } from '@workspace/api-client-react';

/**
 * Library identity is URL-based in the current data model.
 *
 * The API performs the authoritative, fuller canonicalisation when saving. The
 * client only needs a stable comparison for rows the API has already returned,
 * where case and trailing slashes are the common harmless differences. Keeping
 * this in one helper prevents each screen from inventing a slightly different
 * meaning of "Saved".
 */
export function comparableLibraryUrl(raw: string): string {
  // Locale-independent casing matches the API even on devices configured for
  // languages with special case rules, such as Turkish.
  return raw.trim().replace(/\/+$/, '').toLowerCase();
}

/** Return the learner-owned copy of a resource, if the library contains one. */
export function findSavedResource(resources: Resource[] | undefined, url: string): Resource | undefined {
  const comparable = comparableLibraryUrl(url);
  return resources?.find((resource) => comparableLibraryUrl(resource.url) === comparable);
}
