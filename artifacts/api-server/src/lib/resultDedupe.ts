/**
 * One card per work.
 *
 * The catalog, the remote importers and the AI fallback can all surface the
 * same thing, and a reader does not care which of them found it. Before this
 * ran server-side the only defence was in the web client, so the mobile app,
 * the API and anything else reading the endpoint each saw the raw list — and
 * even in the browser, a page could arrive with a book's chapters, an
 * edition and the book itself all counted separately against the page size,
 * which is why a "search more" page could come back looking both repetitive
 * and short.
 */

type DedupableResult = {
  title: string;
  url: string;
  description?: string | null;
  thumbnailUrl?: string | null;
};

/** The same link written two ways is the same link. */
export function canonicalResultUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()])
      if (key.startsWith("utm_") || ["si", "fbclid", "gclid"].includes(key))
        url.searchParams.delete(key);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/** The site a result came from, ignoring language and www subdomains. */
function sourceFamily(value: string): string {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    // en.wikibooks.org and de.wikibooks.org are one family; so are
    // ocw.mit.edu and mit.edu.
    return parts.slice(-2).join(".");
  } catch {
    return "";
  }
}

const TITLE_NOISE = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

function titleWords(title: string): string[] {
  // Single characters are kept on purpose. In course titles they carry the
  // whole distinction — drop them and "AP Physics 1" and "AP Physics B"
  // become the same three words, and one of two real courses disappears.
  return title
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && !TITLE_NOISE.has(word));
}

/**
 * Whether two results are the same work.
 *
 * Same link always. Otherwise only within one site: "AP Physics" on Wikipedia
 * and "AP Physics" on Wikiversity are an article and a course, genuinely two
 * things, while "Calculus" and "Calculus/Print version" on one wiki are one
 * book seen twice.
 */
export function isSameWork(
  first: DedupableResult,
  second: DedupableResult,
): boolean {
  if (canonicalResultUrl(first.url) === canonicalResultUrl(second.url))
    return true;
  const family = sourceFamily(first.url);
  if (!family || family !== sourceFamily(second.url)) return false;
  const firstWords = titleWords(first.title);
  const secondWords = titleWords(second.title);
  if (!firstWords.length || !secondWords.length) return false;
  const overlap = firstWords.filter((word) => secondWords.includes(word)).length;
  // Measured against the longer title, so containment is not similarity. Using
  // the shorter one scores every subset as a perfect match: "Linear algebra"
  // then swallowed "Numerical linear algebra" and "Kernel (linear algebra)",
  // and a first page collapsed from sixteen results to four.
  return (
    overlap / Math.max(1, firstWords.length, secondWords.length) >= 0.8
  );
}

/** How much a reader gets from this card, used to pick between duplicates. */
function richness(item: DedupableResult): number {
  const description = item.description?.trim() ?? "";
  // A placeholder description is the importer admitting it found nothing to
  // say, so any real one beats it.
  const described = /^an? (?:complete )?open educational/i.test(description)
    ? 0
    : Math.min(description.length, 400);
  return described + (item.thumbnailUrl ? 200 : 0);
}

/**
 * Collapse duplicate works, keeping the fullest version of each and the order
 * the caller ranked them in.
 */
export function dedupeResults<T extends DedupableResult>(items: T[]): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const index = kept.findIndex((candidate) => isSameWork(candidate, item));
    if (index < 0) kept.push(item);
    else if (richness(item) > richness(kept[index])) kept[index] = item;
  }
  return kept;
}
