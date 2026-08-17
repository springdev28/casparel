const GOAL_SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "be",
  "become",
  "for",
  "in",
  "learn",
  "master",
  "of",
  "on",
  "study",
  "the",
  "to",
  "understand",
  "with",
]);

/** Everything a POSIX regular expression treats as syntax. */
const REGEX_SYNTAX = /[.^$*+?()[\]{}|\\-]/g;

/**
 * Below this length a term is matched as a whole word rather than a prefix.
 * Two letters carry almost no meaning as a prefix: "AP" opens "Apps", "APIs"
 * and "application" as readily as "AP Physics".
 */
const WHOLE_WORD_MAX_LENGTH = 2;

/**
 * A Postgres regex matching `term` as a word.
 *
 * Search used to test `column ILIKE '%term%'`, which matches anywhere inside a
 * word: searching "AP Physics C: Electricity and Mechanics" returned a
 * full-stack web development roadmap, because "roadmAP" contains "ap". Since
 * the terms are OR-ed together, one accidental hit was enough to return a row.
 *
 * `\m` anchors to a word start, which keeps prefixes working — "physic" finds
 * "Physics", "algebra" finds "Pre-Algebra", a hyphen being a word edge. Short
 * terms also get `\M`, the closing edge, so they must be the whole word: with
 * a word-start match alone that same AP Physics search still returned GeoGebra
 * Math **Ap**ps and a React course teaching **AP**Is.
 *
 * The term is escaped because the fallback branch of meaningfulSearchTerms can
 * return punctuation, and an unescaped "C++" is not a valid regex.
 */
export function wordStartPattern(term: string) {
  const escaped = term.replace(REGEX_SYNTAX, "\\$&");
  return term.length <= WHOLE_WORD_MAX_LENGTH
    ? `\\m${escaped}\\M`
    : `\\m${escaped}`;
}

/**
 * Progressively broader searches for the same intent.
 *
 * Providers are only ever asked for the exact phrase someone typed, so the
 * catalog ends up as narrow as the first search that built it: after someone
 * looked for "AP Physics C: Electricity and Mechanics" the catalog held
 * fourteen works, and a later search for plain "physics mechanics" found the
 * same fourteen and nothing else. A course name is a narrow phrase; the
 * subjects inside it are not.
 *
 * Used when a page has run out, to reach past the original phrasing: first the
 * topic words together, then each on its own. Whatever comes back still has to
 * earn its place against the reader's actual query, so broadening the import
 * cannot loosen the results.
 */
export function broadenedQueries(value: string, limit = 3): string[] {
  const terms = meaningfulSearchTerms(value);
  const substantive = terms.filter((term) => term.length >= 3);
  if (!substantive.length) return [];

  const ladder: string[] = [];
  if (substantive.length < terms.length) ladder.push(substantive.join(" "));
  if (substantive.length > 1) ladder.push(...substantive);

  const seen = new Set([terms.join(" ").toLowerCase()]);
  const broader: string[] = [];
  for (const candidate of ladder) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    broader.push(candidate);
    if (broader.length === limit) break;
  }
  return broader;
}

export function meaningfulSearchTerms(value: string, limit = 8) {
  const terms = value
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .filter((term) => !GOAL_SEARCH_STOP_WORDS.has(term.toLocaleLowerCase()));
  const unique = [...new Set(terms)].slice(0, limit);
  if (unique.length) return unique;
  const fallback = value.trim().replace(/\s+/g, " ");
  return fallback ? [fallback] : [];
}

/**
 * The values of a filter that accepts more than one.
 *
 * Comma-separated, because a query string is what the browser sends and repeated
 * keys are read inconsistently by proxies and by the generated client. Bounded,
 * so a filter cannot become a way to make the database do arbitrary work.
 *
 * Here rather than beside the catalog query it feeds: this is about reading a
 * query string, and the route needs it in tests that mock the catalog away —
 * where importing it from there left it undefined and every request a 500.
 */
const FILTER_VALUE_LIMIT = 12;

export function filterValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, FILTER_VALUE_LIMIT);
}
