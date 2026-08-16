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
