/**
 * @fileOverview Web domain role: centralizes Stale Build state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/**
 * Did this error come from a build that is no longer on the server?
 *
 * Every page in this app is a `lazy(() => import(...))`, and a deploy replaces
 * the previous build's hashed chunks. A tab that was open when that happened
 * is still running the old shell: it holds chunk names that were deleted
 * minutes ago, and asks for one the moment somebody clicks through to a page
 * they have not opened yet.
 *
 * There is no error code for this. Each browser words it differently, so this
 * matches the wording rather than a type, and keeps the wordings together
 * where they can be read as a set.
 *
 * The SyntaxError is the shape this took before the server was fixed: a
 * missing file was answered with index.html at HTTP 200, so the browser
 * parsed `<!DOCTYPE html>` as JavaScript. The server 404s those now, but a
 * tab running an old build is running the old behaviour with it, and this is
 * the code that has to recognise it.
 */
export function isStaleBuildError(error: {
  name?: string;
  message?: string;
} | null | undefined): boolean {
  const message = String(error?.message ?? '');
  if (!message) return false;
  return (
    // Chrome, Safari and Firefox each say it their own way.
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /dynamically imported module/i.test(message) ||
    // A chunk answered with a page of HTML, parsed as JavaScript.
    (error?.name === 'SyntaxError' && /unexpected token\s*'?</i.test(message))
  );
}
