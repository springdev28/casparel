/**
 * @fileOverview Backend domain role: centralizes Search Ranking logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import { meaningfulSearchTerms } from "./searchTerms";

export type SearchIntent =
  | "learn"
  | "practice"
  | "reference"
  | "research"
  | "primary-source";

export type SearchMaterial =
  | "course"
  | "book"
  | "explanation"
  | "practice"
  | "interactive"
  | "video"
  | "reference"
  | "paper"
  | "primary-source"
  | "repository"
  | "other";

export type SearchIntentOption = SearchIntent | "auto";
export type SearchMaterialOption = SearchMaterial | "all";

export type RankableCatalogItem = {
  title: string;
  description?: string | null;
  subject?: string | null;
  provider?: string | null;
  source?: string | null;
  author?: string | null;
  format?: string | null;
  canonicalUrl?: string | null;
  url?: string | null;
  providerUrl?: string | null;
  language?: string | null;
  license?: string | null;
  thumbnailUrl?: string | null;
  sourceKind?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SearchRankingOptions = {
  query: string;
  intent?: SearchIntentOption;
  material?: SearchMaterialOption;
};

const MATERIALS = new Set<SearchMaterial>([
  "course",
  "book",
  "explanation",
  "practice",
  "interactive",
  "video",
  "reference",
  "paper",
  "primary-source",
  "repository",
  "other",
]);

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function includesCue(value: string, cues: readonly string[]) {
  return cues.some((cue) => value.includes(cue));
}

export function inferSearchIntent(
  query: string,
  requested: SearchIntentOption = "auto",
): SearchIntent {
  if (requested !== "auto") return requested;
  const value = normalized(query);
  if (
    includesCue(value, [
      "primary source",
      "original text",
      "original document",
      "historical document",
      "speech transcript",
      "dataset",
      "birincil kaynak",
      "orijinal metin",
    ])
  )
    return "primary-source";
  if (
    includesCue(value, [
      "peer reviewed",
      "review paper",
      "systematic review",
      "research paper",
      "journal article",
      "open access paper",
      "preprint",
      "meta analysis",
      "hakemli",
      "araştırma makalesi",
      "akademik makale",
    ])
  )
    return "research";
  if (
    includesCue(value, [
      "practice problem",
      "practice questions",
      "problem set",
      "worked example",
      "worksheet",
      "quiz",
      "exercise",
      "soru çözümü",
      "soru çözumü",
      "alıştırma",
      "test çöz",
    ])
  )
    return "practice";
  if (
    includesCue(value, [
      "definition",
      "encyclopedia",
      "handbook",
      "quick reference",
      "overview",
      "glossary",
      "nedir",
      "tanımı",
      "genel bakış",
    ])
  )
    return "reference";
  return "learn";
}

function metadataMaterial(item: RankableCatalogItem) {
  const value = item.metadata?.material;
  return typeof value === "string" && MATERIALS.has(value as SearchMaterial)
    ? (value as SearchMaterial)
    : null;
}

export function inferSearchMaterial(item: RankableCatalogItem): SearchMaterial {
  const explicit = metadataMaterial(item);
  if (explicit) return explicit;

  const provider = normalized(item.provider ?? item.source);
  const value = normalized(
    [
      item.title,
      item.description,
      item.subject,
      item.provider,
      item.source,
      item.author,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (
    provider.includes("wikipedia") ||
    includesCue(value, [
      "encyclopedia",
      "dictionary",
      "glossary",
      "quick reference",
      "reference article",
    ])
  )
    return "reference";
  if (
    includesCue(value, [
      "primary source",
      "original text",
      "original document",
      "historical document",
      "speech transcript",
      "treaty text",
      "dataset",
      "birincil kaynak",
    ])
  )
    return "primary-source";
  if (
    includesCue(value, [
      "problem set",
      "practice problem",
      "practice questions",
      "worked example",
      "worksheet",
      "quiz",
      "exercises",
      "soru çözümü",
      "alıştırma",
    ])
  )
    return "practice";
  if (
    includesCue(value, [
      "course",
      "curriculum",
      "learning path",
      "open courseware",
      "full course",
      "dersi",
      "kursu",
    ])
  )
    return "course";
  if (
    includesCue(value, [
      "textbook",
      "ebook",
      "open book",
      "bookshelf",
      "ders kitabı",
    ]) ||
    item.sourceKind === "open-library" ||
    item.sourceKind === "wikibooks"
  )
    return "book";
  if (
    includesCue(value, [
      "peer reviewed",
      "research paper",
      "review paper",
      "journal article",
      "preprint",
      "systematic review",
      "meta analysis",
    ])
  )
    return "paper";
  if (
    includesCue(value, [
      "directory",
      "catalogue",
      "catalog",
      "database",
      "repository",
      "archive",
      "searchable library",
      "journal index",
    ])
  )
    return "repository";
  if (item.format === "interactive") return "interactive";
  if (item.format === "video" || item.format === "podcast") return "video";
  if (
    includesCue(value, [
      "lesson",
      "tutorial",
      "guide",
      "introduction",
      "explained",
      "analysis",
      "konu anlatımı",
    ]) ||
    item.format === "article"
  )
    return "explanation";
  return "other";
}

function credibilityScore(item: RankableCatalogItem) {
  // Credibility is deliberately a small quality bonus, not a relevance
  // override. An authoritative but off-topic source should still rank below a
  // useful source that actually answers the learner's query.
  switch (item.metadata?.credibility) {
    case "academic":
      return 8;
    case "institutional":
      return 7;
    case "established":
      return 5;
    case "independent":
      return 3;
    default:
      return 0;
  }
}

function intentUtility(intent: SearchIntent, material: SearchMaterial) {
  // These weights encode product utility rather than generic popularity. For
  // example, a learner asking to practise should see exercises before a broad
  // reference repository even when the repository has richer metadata.
  const scores: Record<SearchIntent, Partial<Record<SearchMaterial, number>>> = {
    learn: {
      course: 26,
      book: 20,
      practice: 18,
      interactive: 18,
      explanation: 16,
      video: 13,
      reference: -8,
      paper: -10,
      "primary-source": -5,
      repository: -14,
    },
    practice: {
      practice: 32,
      interactive: 22,
      course: 9,
      book: 6,
      explanation: 5,
      reference: -10,
      paper: -12,
      repository: -16,
    },
    reference: {
      reference: 30,
      book: 10,
      explanation: 8,
      repository: 4,
      practice: -5,
    },
    research: {
      paper: 32,
      "primary-source": 14,
      book: 10,
      repository: 8,
      reference: 5,
      practice: -10,
    },
    "primary-source": {
      "primary-source": 36,
      paper: 9,
      repository: 7,
      book: 5,
      reference: -4,
    },
  };
  return scores[intent][material] ?? 0;
}

function itemUrl(item: RankableCatalogItem) {
  return item.canonicalUrl ?? item.url ?? item.providerUrl ?? "";
}

function providerKey(item: RankableCatalogItem) {
  const url = itemUrl(item);
  try {
    return new URL(url).hostname.toLocaleLowerCase().replace(/^www\./, "");
  } catch {
    return normalized(item.provider ?? item.source) || "unknown";
  }
}

function canonicalUrlKey(item: RankableCatalogItem) {
  const raw = itemUrl(item);
  try {
    const url = new URL(raw);
    // Tracking parameters and fragments identify visits/anchors, not distinct
    // learning resources. Removing only known tracking keys avoids collapsing
    // meaningful query-driven pages such as a specific catalog search.
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["fbclid", "gclid", "si"].includes(key))
        url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return normalized(raw);
  }
}

function sameWorkKey(item: RankableCatalogItem) {
  // Providers often return multiple URLs or editions for one work. This looser
  // key complements exact URL deduplication so the first page is not occupied
  // by near-identical versions from the same host.
  const title = normalized(item.title)
    .replace(/\b(?:second|third|fourth|\d+(?:st|nd|rd|th)|2e|3e|4e) edition\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${providerKey(item)}:${title}`;
}

function topicalScore(item: RankableCatalogItem, query: string) {
  const terms = meaningfulSearchTerms(query).map(normalized);
  const title = normalized(item.title);
  const subject = normalized(item.subject);
  const description = normalized(item.description);
  const provider = normalized(item.provider ?? item.source);
  const author = normalized(item.author);
  const phrase = normalized(query);
  let score = 0;
  if (phrase && title === phrase) score += 70;
  else if (phrase && title.includes(phrase)) score += 38;
  if (phrase && subject === phrase) score += 24;

  let covered = 0;
  for (const term of terms) {
    let matched = false;
    if (title.includes(term)) {
      score += 12;
      matched = true;
    }
    if (subject.includes(term)) {
      score += 8;
      matched = true;
    }
    if (description.includes(term)) {
      score += 4;
      matched = true;
    }
    if (provider.includes(term) || author.includes(term)) {
      score += 2;
      matched = true;
    }
    if (matched) covered += 1;
  }
  if (terms.length) {
    const coverage = covered / terms.length;
    score += coverage * 24;
    if (covered === terms.length) score += 12;
  }
  return score;
}

function metadataScore(item: RankableCatalogItem, material: SearchMaterial) {
  let score = credibilityScore(item);
  if ((item.description?.trim().length ?? 0) >= 50) score += 4;
  if (item.author?.trim()) score += 2;
  if (item.license?.trim()) score += 2;
  if (item.thumbnailUrl?.trim()) score += 3;
  if (item.metadata?.contentScope === "whole-work") score += 7;
  if (material === "repository") score -= 7;
  return score;
}

export function scoreCatalogItem(
  item: RankableCatalogItem,
  options: SearchRankingOptions,
) {
  const intent = inferSearchIntent(options.query, options.intent);
  const material = inferSearchMaterial(item);
  const requestedMaterial = options.material ?? "all";
  // Keep scoring additive and inspectable: topical match dominates, intent
  // adjusts usefulness, metadata rewards completeness, and an explicit filter
  // receives a final boost before the hard filter in rankCatalogItems.
  return (
    topicalScore(item, options.query) +
    intentUtility(intent, material) +
    metadataScore(item, material) +
    (requestedMaterial !== "all" && requestedMaterial === material ? 30 : 0)
  );
}

export function rankCatalogItems<T extends RankableCatalogItem>(
  items: readonly T[],
  options: SearchRankingOptions,
): T[] {
  const requestedMaterial = options.material ?? "all";
  const deduplicated: T[] = [];
  const seenUrls = new Set<string>();
  const seenWorks = new Set<string>();
  const bestFirst = items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      score: scoreCatalogItem(item, options),
    }))
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

  // Deduplicate after scoring so the strongest representation survives. Doing
  // this in provider arrival order would make ranking depend on network timing.
  for (const { item } of bestFirst) {
    const material = inferSearchMaterial(item);
    if (requestedMaterial !== "all" && material !== requestedMaterial) continue;
    const urlKey = canonicalUrlKey(item);
    const workKey = sameWorkKey(item);
    if ((urlKey && seenUrls.has(urlKey)) || seenWorks.has(workKey)) continue;
    if (urlKey) seenUrls.add(urlKey);
    seenWorks.add(workKey);
    deduplicated.push(item);
  }

  const intent = inferSearchIntent(options.query, options.intent);
  const remaining = deduplicated
    .map((item, originalIndex) => ({
      item,
      material: inferSearchMaterial(item),
      provider: providerKey(item),
      score: scoreCatalogItem(item, options),
      originalIndex,
    }))
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
  const ranked: T[] = [];
  const providerCounts = new Map<string, number>();
  const materialCounts = new Map<SearchMaterial, number>();
  let referenceCount = 0;

  // Diversification is constrained to candidates within 24 points of the best
  // remaining result. That guard prevents variety from promoting a clearly
  // irrelevant source, while provider/material penalties stop one catalog from
  // monopolizing the useful top results.
  while (remaining.length) {
    const position = ranked.length;
    const bestScore = remaining[0].score;
    let eligible = remaining.filter((entry) => entry.score >= bestScore - 24);

    if (position < 10) {
      const underProviderCap = eligible.filter(
        (entry) => (providerCounts.get(entry.provider) ?? 0) < 2,
      );
      if (underProviderCap.length) eligible = underProviderCap;
    }
    if (intent === "learn" && position < 5 && referenceCount >= 1) {
      const nonReference = eligible.filter(
        (entry) => entry.material !== "reference",
      );
      if (nonReference.length) eligible = nonReference;
    }

    eligible.sort((a, b) => {
      const aAdjusted =
        a.score -
        (providerCounts.get(a.provider) ?? 0) * 9 -
        (materialCounts.get(a.material) ?? 0) * 2;
      const bAdjusted =
        b.score -
        (providerCounts.get(b.provider) ?? 0) * 9 -
        (materialCounts.get(b.material) ?? 0) * 2;
      return bAdjusted - aAdjusted || a.originalIndex - b.originalIndex;
    });

    const selected = eligible[0];
    remaining.splice(remaining.indexOf(selected), 1);
    ranked.push(selected.item);
    providerCounts.set(
      selected.provider,
      (providerCounts.get(selected.provider) ?? 0) + 1,
    );
    materialCounts.set(
      selected.material,
      (materialCounts.get(selected.material) ?? 0) + 1,
    );
    if (selected.material === "reference") referenceCount += 1;
  }

  return ranked;
}
