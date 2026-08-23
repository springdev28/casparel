/**
 * @fileOverview Repository role: implements or configures Index.
 * System connection: see docs/codebase-guide.md and docs/source-file-index.md for its package boundary and consumers.
 */
/**
 * When two search results are the same work.
 *
 * Shared on purpose. This rule used to exist twice — once in the API and once
 * in the web client — and the copies drifted: a fix to the API's similarity
 * left the browser still scoring a contained title as a perfect match, so an
 * endpoint that returned sixteen results rendered three cards. One definition,
 * imported by both, is the only way that cannot happen again.
 *
 * The rule has to be conservative in one direction: wrongly merging two works
 * silently deletes one from the page, while wrongly keeping both shows a
 * duplicate the reader can see and ignore. Everything here is tuned for the
 * first failure being the worse one.
 */

export type IdentifiableResource = {
  title: string;
  url: string;
};

export type RankableResource = IdentifiableResource & {
  description?: string | null;
  thumbnailUrl?: string | null;
};

/** Query parameters that identify a referrer rather than a resource. */
const TRACKING_PARAMS = new Set(["si", "fbclid", "gclid", "mc_cid", "mc_eid"]);

/**
 * One spelling per link.
 *
 * Case, `www.`, a trailing slash, a fragment and tracking parameters are all
 * ways of writing the same address, and results arriving from the catalog, a
 * remote importer and the AI fallback spell them differently.
 */
export function canonicalResourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()])
      if (key.startsWith("utm_") || TRACKING_PARAMS.has(key))
        url.searchParams.delete(key);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * The site a result came from, ignoring language and service subdomains.
 *
 * en.wikibooks.org and de.wikibooks.org are one family, and so are ocw.mit.edu
 * and mit.edu. Suffixes that are really registries need three labels, or
 * everything hosted under them would look like one site.
 */
const MULTIPART_SUFFIXES = new Set([
  "ac.uk",
  "co.uk",
  "com.au",
  "com.br",
  "com.tr",
  "edu.au",
  "edu.tr",
  "gov.tr",
  "gov.uk",
  "org.tr",
  "org.uk",
]);

export function sourceFamily(value: string): string {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    const twoLabelSuffix = parts.slice(-2).join(".");
    const size = MULTIPART_SUFFIXES.has(twoLabelSuffix) ? 3 : 2;
    return parts.length > size ? parts.slice(-size).join(".") : host;
  } catch {
    return "";
  }
}

/** Words that carry no distinction between two titles. */
const TITLE_NOISE = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "ebook",
  "lesson",
  "pdf",
  "video",
]);

/**
 * The words of a title that distinguish it.
 *
 * Single characters are kept on purpose. In course titles they carry the whole
 * distinction — drop them and "AP Physics C" and "AP Physics B" become the same
 * two words, and one of two real courses disappears from the results.
 */
export function titleWords(title: string): string[] {
  return title
    .toLocaleLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && !TITLE_NOISE.has(word));
}

/** How alike two titles are, between 0 and 1. */
export function titleSimilarity(first: string, second: string): number {
  const firstWords = titleWords(first);
  const secondWords = titleWords(second);
  if (!firstWords.length || !secondWords.length) return 0;
  const overlap = firstWords.filter((word) => secondWords.includes(word)).length;
  // Against the longer title, so containment is not similarity. Measured
  // against the shorter one, every subset scores a perfect match: "Linear
  // algebra" then swallowed "Numerical linear algebra" and "Kernel (linear
  // algebra)", and a page of sixteen results collapsed to four.
  return overlap / Math.max(firstWords.length, secondWords.length);
}

/** Titles this alike, on one site, are taken to be the same work. */
export const SAME_WORK_SIMILARITY = 0.8;

/**
 * Whether two results are the same work.
 *
 * The same link always is. Otherwise only within one site: "AP Physics" on
 * Wikipedia and "AP Physics" on Wikiversity are an article and a course,
 * genuinely two things, while a book and its print version on one wiki are one
 * book seen twice.
 */
export function isSameWork(
  first: IdentifiableResource,
  second: IdentifiableResource,
): boolean {
  if (canonicalResourceUrl(first.url) === canonicalResourceUrl(second.url))
    return true;
  const family = sourceFamily(first.url);
  if (!family || family !== sourceFamily(second.url)) return false;
  return titleSimilarity(first.title, second.title) >= SAME_WORK_SIMILARITY;
}

/** A description the importer wrote because it found nothing to say. */
const PLACEHOLDER_DESCRIPTION = /^an?\s+(?:complete\s+)?open educational/i;

/**
 * How much a reader gets from a card, used only to choose between duplicates.
 */
export function resourceRichness(item: RankableResource): number {
  const description = item.description?.trim() ?? "";
  const described = PLACEHOLDER_DESCRIPTION.test(description)
    ? 0
    : Math.min(description.length, 400);
  return described + (item.thumbnailUrl ? 200 : 0);
}

/**
 * Spread results so no single source owns the page.
 *
 * Relevance alone hands the whole page to whichever provider is biggest:
 * Wikipedia has an article on everything, so it won every slot and a full page
 * of sixteen results read as "the same thing over and over". This keeps the
 * ranking — the best result is still first — but once a source has had its
 * share, its remaining results wait behind everyone else's.
 *
 * `share` is how many a source may take before it starts yielding. Results
 * never disappear: they are only moved down.
 */
export function balanceBySource<T extends IdentifiableResource>(
  items: T[],
  share: number,
): T[] {
  if (share < 1) return items;
  const queues = new Map<string, T[]>();
  const order: string[] = [];
  for (const item of items) {
    const family = sourceFamily(item.url) || item.url.toLowerCase();
    if (!queues.has(family)) {
      queues.set(family, []);
      order.push(family);
    }
    queues.get(family)!.push(item);
  }
  // One source only: nothing to interleave, and reordering would lose the
  // ranking for no benefit.
  if (order.length < 2) return items;

  const balanced: T[] = [];
  while (balanced.length < items.length) {
    let placedThisRound = false;
    for (const family of order) {
      const queue = queues.get(family)!;
      for (let taken = 0; taken < share && queue.length; taken += 1) {
        balanced.push(queue.shift()!);
        placedThisRound = true;
      }
    }
    // Every queue is empty; the guard is against an unterminated loop rather
    // than a case that should happen.
    if (!placedThisRound) break;
  }
  return balanced;
}

/**
 * Collapse duplicate works, keeping the fullest version of each and the order
 * the caller ranked them in.
 */
export function dedupeByWork<T extends RankableResource>(
  items: T[],
  isBetter: (candidate: T, incumbent: T) => boolean = (candidate, incumbent) =>
    resourceRichness(candidate) > resourceRichness(incumbent),
): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const index = kept.findIndex((candidate) => isSameWork(candidate, item));
    if (index < 0) kept.push(item);
    else if (isBetter(item, kept[index])) kept[index] = item;
  }
  return kept;
}
