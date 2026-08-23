/**
 * @fileOverview Backend domain role: centralizes Search Terms logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
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

/**
 * Words short enough to be an abbreviation do not carry a topic.
 *
 * Matching only "AP" is not a reason to return anything — a high school's
 * article mentions AP courses, and that was enough to answer a physics search.
 */
export const SUBSTANTIVE_TERM_LENGTH = 3;

/**
 * Words that name the *packaging* of a resource rather than its topic.
 *
 * These are what someone adds to say what kind of thing they want back, and on
 * their own they are evidence of nothing. A search for "kinematics projectile
 * motion tutorial" came back as fifteen t-shirt printing videos, every one of
 * them matching "tutorial" and nothing else: one word out of four, in the
 * title, was worth the two points the bar asked for.
 *
 * They had been imported for the same reason. The broadening ladder takes a
 * query that has run dry and asks the providers for each of its words alone,
 * and "tutorial" alone is a question about t-shirts, screen printing and
 * Illustrator. So the catalog was poisoned by the ladder and then the poison
 * cleared the relevance bar.
 *
 * Listed here, they stop doing both. They still count towards a row's *rank* —
 * between two works on kinematics the one that is a tutorial should come first
 * when that is what was asked for — they just cannot be the only thing a row
 * matched, and they are never sent to a provider on their own.
 */
const PACKAGING_TERMS = new Set([
  "advanced",
  "answer",
  "answers",
  "basic",
  "basics",
  "beginner",
  "beginners",
  "best",
  "book",
  "books",
  "chapter",
  "class",
  "classes",
  "complete",
  "course",
  "courses",
  "crash",
  "curriculum",
  "definition",
  "doc",
  "docs",
  "download",
  "easy",
  "ebook",
  "example",
  "examples",
  "exercise",
  "exercises",
  "explained",
  "explanation",
  "free",
  "guide",
  "guides",
  "help",
  "how",
  "intro",
  "introduction",
  "lecture",
  "lectures",
  "lesson",
  "lessons",
  "meaning",
  "note",
  "notes",
  "online",
  "overview",
  "part",
  "pdf",
  "playlist",
  "ppt",
  "practice",
  "problem",
  "problems",
  "quick",
  "quiz",
  "quizzes",
  "revision",
  "simple",
  "slides",
  "solution",
  "solutions",
  "step",
  "steps",
  "summary",
  "syllabus",
  "textbook",
  "textbooks",
  "tips",
  "tricks",
  "tutorial",
  "tutorials",
  "video",
  "videos",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "worksheet",
  "worksheets",
]);

/**
 * The words in a query that carry its topic.
 *
 * Empty is a real answer: "practice problems" and "past papers" are things
 * people genuinely search for, and there is no topic in either. Callers fall
 * back to the whole query rather than matching nothing at all.
 */
export function topicalSearchTerms(terms: string[]): string[] {
  return terms.filter(
    (term) =>
      term.length >= SUBSTANTIVE_TERM_LENGTH &&
      !PACKAGING_TERMS.has(term.toLocaleLowerCase()),
  );
}

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
 *
 * Only the topic words, never the packaging ones. Asking a provider for
 * "tutorial" on its own is not a broader version of the question — it is a
 * different question, and the answers to it are what filled the catalog with
 * t-shirt printing videos.
 */
export function broadenedQueries(value: string, limit = 3): string[] {
  const terms = meaningfulSearchTerms(value);
  const substantive = topicalSearchTerms(terms);
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
