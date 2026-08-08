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
