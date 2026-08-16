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
 * A Postgres regex matching `term` at the start of a word.
 *
 * Search used to test `column ILIKE '%term%'`, which matches anywhere inside a
 * word: searching "AP Physics C: Electricity and Mechanics" returned a
 * full-stack web development roadmap, because "roadmAP" contains "ap". Short
 * tokens made almost every row a match, and since the tokens are OR-ed
 * together one accidental hit was enough to return the row.
 *
 * `\m` anchors to a word start, so "ap" no longer matches "roadmap" while
 * "physic" still matches "Physics" and "algebra" still matches "Pre-Algebra" —
 * a hyphen ends a word. The term is escaped because the fallback branch of
 * meaningfulSearchTerms can return punctuation, and an unescaped "C++" is not
 * a valid regex.
 */
export function wordStartPattern(term: string) {
  return `\\m${term.replace(REGEX_SYNTAX, "\\$&")}`;
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
