import { meaningfulSearchTerms } from "./searchTerms";
import {
  matchesCatalogSearch,
  matchesNormalizedResourceFilters,
  normalizeResourceMetadata,
  type NormalizedResourceMetadata,
} from "./catalogNormalization";

export const DISCOVERY_MATERIAL_TYPES = [
  "course",
  "lesson",
  "class-notes",
  "worksheet",
  "practice",
  "textbook",
  "reference",
  "research",
  "discussion",
  "tool",
  "media",
  "other",
] as const;

export type DiscoveryMaterialType = (typeof DISCOVERY_MATERIAL_TYPES)[number];

export const DISCOVERY_SOURCE_CATEGORIES = [
  "academic",
  "institutional",
  "open-education",
  "community",
  "archive",
  "creator",
  "publisher",
  "other",
] as const;

export type DiscoverySourceCategory =
  (typeof DISCOVERY_SOURCE_CATEGORIES)[number];

type DiscoveryFormat =
  "article" | "video" | "pdf" | "podcast" | "interactive" | "other";

type DiscoveryCredibility =
  "academic" | "institutional" | "established" | "independent";

export type DiscoveryCandidate = {
  title: string;
  url: string;
  description: string;
  format: DiscoveryFormat;
  source: string;
  thumbnailUrl?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  materialType?: DiscoveryMaterialType;
  sourceCategory?: DiscoverySourceCategory;
  language?: string | null;
  accessType?: "open" | "free-account" | "paid" | "unknown" | null;
  difficulty?: string | null;
  contentLength?: "short" | "medium" | "long" | "unknown" | null;
  license?: string | null;
  publishedAt?: string | null;
  captionsAvailable?: boolean | null;
  transcriptAvailable?: boolean | null;
  sourceCredibility?: DiscoveryCredibility;
  author?: string | null;
  material?: string | null;
  normalizedMetadata?: NormalizedResourceMetadata;
};

export type DiscoveryFilterOptions = {
  query: string;
  format?: DiscoveryFormat;
  subject?: string;
  course?: string;
  gradeLevel?: string;
  exactPhrase?: string;
  excludedWords?: string;
  source?: string;
  excludeSource?: string;
  excludeSubjects?: string;
  author?: string;
  titleOnly?: boolean;
  hasThumbnail?: boolean;
  publishedFrom?: number;
  publishedTo?: number;
  freshness?: string;
  difficulty?: string;
  accessType?: string;
  license?: string;
  contentLength?: string;
  sourceQuality?: string;
  material?: string;
  materialType?: string;
  sourceCategory?: string;
  language?: string;
  captions?: boolean;
  transcript?: boolean;
  limit?: number;
};

const OPEN_EDUCATION_HOSTS = [
  "khanacademy.org",
  "ocw.mit.edu",
  "openstax.org",
  "oercommons.org",
  "libretexts.org",
  "wikibooks.org",
  "open.edu",
  "edx.org",
  "coursera.org",
];

const COMMUNITY_HOSTS = [
  "reddit.com",
  "stackexchange.com",
  "stackoverflow.com",
  "mathoverflow.net",
  "quora.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "linkedin.com",
  "bsky.app",
  "mastodon.social",
  "mastodon.online",
  "mstdn.social",
  "threads.net",
  "discord.com",
  "discord.gg",
  "t.me",
  "telegram.me",
  "vk.com",
  "weibo.com",
  "zhihu.com",
];

const ARCHIVE_HOSTS = [
  "archive.org",
  "gutenberg.org",
  "hathitrust.org",
  "loc.gov",
  "europeana.eu",
  "dp.la",
];

const CREATOR_HOSTS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "tiktok.com",
  "instagram.com",
  "tumblr.com",
  "pinterest.com",
  "twitch.tv",
  "dailymotion.com",
  "slideshare.net",
  "xiaohongshu.com",
  "medium.com",
  "substack.com",
  "spotify.com",
  "podcasts.apple.com",
];

const ESTABLISHED_HOSTS = [
  ...OPEN_EDUCATION_HOSTS,
  "wikipedia.org",
  "ted.com",
  "britannica.com",
  "nationalgeographic.com",
  "nature.com",
  "sciencedirect.com",
  "springer.com",
];

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hostname(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname
      .toLocaleLowerCase()
      .replace(/^(?:www\.|old\.)/, "");
  } catch {
    return "";
  }
}

function matchesHost(host: string, knownHosts: string[]) {
  return knownHosts.some(
    (known) => host === known || host.endsWith(`.${known}`),
  );
}

export function canonicalDiscoveryUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.hostname = url.hostname
      .toLocaleLowerCase()
      .replace(/^(?:www\.|old\.)/, "");
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLocaleLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "igshid", "si", "share_id"].includes(
          key.toLocaleLowerCase(),
        )
      )
        url.searchParams.delete(key);
    }
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

export function inferDiscoverySourceCategory(
  item: DiscoveryCandidate,
): DiscoverySourceCategory {
  if (
    item.sourceCategory &&
    DISCOVERY_SOURCE_CATEGORIES.includes(item.sourceCategory)
  )
    return item.sourceCategory;

  const host = hostname(item.url);
  if (matchesHost(host, COMMUNITY_HOSTS)) return "community";
  if (matchesHost(host, ARCHIVE_HOSTS)) return "archive";
  if (matchesHost(host, OPEN_EDUCATION_HOSTS)) return "open-education";
  if (
    host.endsWith(".edu") ||
    host.includes(".edu.") ||
    host.endsWith(".ac.uk") ||
    host.includes(".ac.") ||
    matchesHost(host, [
      "arxiv.org",
      "pubmed.ncbi.nlm.nih.gov",
      "scholar.google.com",
      "jstor.org",
      "semanticscholar.org",
    ])
  )
    return "academic";
  if (
    host.endsWith(".gov") ||
    host.includes(".gov.") ||
    /(?:museum|library|libraries|institute|institution)/i.test(host)
  )
    return "institutional";
  if (matchesHost(host, CREATOR_HOSTS)) return "creator";
  if (matchesHost(host, ["github.com", "gitlab.com", "kaggle.com"]))
    return "community";
  if (matchesHost(host, ESTABLISHED_HOSTS)) return "publisher";
  return "other";
}

export function inferDiscoveryMaterialType(
  item: DiscoveryCandidate,
): DiscoveryMaterialType {
  if (item.materialType && DISCOVERY_MATERIAL_TYPES.includes(item.materialType))
    return item.materialType;

  const text = normalized(
    `${item.title} ${item.description} ${item.source} ${item.url}`,
  );
  if (/\b(class|course|lecture) notes?\b|\bstudy guide\b/.test(text))
    return "class-notes";
  if (/\bworksheets?\b|\bproblem sets?\b|\bexercise sheets?\b/.test(text))
    return "worksheet";
  if (
    /\bpractice (?:test|exam|questions?)\b|\bquizzes?\b|\bmock exams?\b|\banswer keys?\b/.test(
      text,
    )
  )
    return "practice";
  if (/\btextbooks?\b|\bopen books?\b|\bebooks?\b/.test(text))
    return "textbook";
  if (/\bcourses?\b|\bmoocs?\b|\bcurriculum\b/.test(text)) return "course";
  if (/\blessons?\b|\btutorials?\b|\bhow to\b/.test(text)) return "lesson";
  if (/\bresearch\b|\bpapers?\b|\bpreprints?\b|\bjournal\b/.test(text))
    return "research";
  if (
    inferDiscoverySourceCategory(item) === "community" ||
    /\bdiscussion\b|\bforum\b|\bq&a\b/.test(text)
  )
    return "discussion";
  if (
    /\bsimulators?\b|\bcalculators?\b|\bnotebooks?\b|\bdatasets?\b|\bsoftware\b|\bgithub\b/.test(
      text,
    )
  )
    return "tool";
  if (item.format === "video" || item.format === "podcast") return "media";
  if (/\breference\b|\bencyclop(?:a|e)edia\b|\bhandbooks?\b/.test(text))
    return "reference";
  if (item.format === "article" || item.format === "pdf") return "reference";
  return "other";
}

function inferCredibility(item: DiscoveryCandidate): DiscoveryCredibility {
  if (item.sourceCredibility) return item.sourceCredibility;
  const category = inferDiscoverySourceCategory(item);
  if (category === "academic") return "academic";
  if (category === "institutional" || category === "archive")
    return "institutional";
  if (
    category === "open-education" ||
    category === "publisher" ||
    matchesHost(hostname(item.url), ESTABLISHED_HOSTS)
  )
    return "established";
  return "independent";
}

function freshnessCutoff(value: string | undefined) {
  const days =
    value === "week"
      ? 7
      : value === "month"
        ? 31
        : value === "year"
          ? 366
          : value === "three_years"
            ? 366 * 3
            : 0;
  return days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
}

function requestedValues(value: string | undefined) {
  return (value ?? "")
    .split(/[,;]+/)
    .map((entry) => normalized(entry))
    .filter(Boolean);
}

function matchesMaterial(item: DiscoveryCandidate, requested: string) {
  const inferred = inferDiscoveryMaterialType(item);
  const corpus = normalized(
    `${item.material ?? ""} ${item.title} ${item.description} ${item.format}`,
  );
  if (requested === "book") return inferred === "textbook";
  if (requested === "paper") return inferred === "research";
  if (requested === "primary")
    return /\bprimary (?:source|text)\b/.test(corpus);
  if (requested === "video")
    return item.format === "video" || inferred === "media";
  return inferred === requested || corpus.includes(requested);
}

export function matchesDiscoveryFilters(
  item: DiscoveryCandidate,
  filters: DiscoveryFilterOptions,
) {
  if (!matchesNormalizedResourceFilters(item, filters)) return false;
  if (
    filters.titleOnly &&
    !matchesCatalogSearch(
      {
        title: item.title,
        subject: item.subject,
        course: item.normalizedMetadata?.courses.join(" "),
      },
      filters.query,
    )
  )
    return false;
  if (
    requestedValues(filters.excludeSubjects).some((subject) =>
      matchesNormalizedResourceFilters(item, { query: "", subject }),
    )
  )
    return false;
  if (filters.excludeSource) {
    const corpus = normalized(`${item.source} ${item.url}`);
    if (
      requestedValues(filters.excludeSource).some((source) =>
        corpus.includes(source),
      )
    )
      return false;
  }
  if (
    filters.author &&
    !normalized(item.author).includes(normalized(filters.author))
  )
    return false;
  if (filters.hasThumbnail === true && !item.thumbnailUrl) return false;
  if (filters.hasThumbnail === false && item.thumbnailUrl) return false;
  const publishedYear = item.publishedAt
    ? new Date(item.publishedAt).getUTCFullYear()
    : NaN;
  if (
    Number.isFinite(filters.publishedFrom) &&
    (!Number.isFinite(publishedYear) || publishedYear < filters.publishedFrom!)
  )
    return false;
  if (
    Number.isFinite(filters.publishedTo) &&
    (!Number.isFinite(publishedYear) || publishedYear > filters.publishedTo!)
  )
    return false;
  const materials = requestedValues(filters.material);
  if (
    materials.length &&
    !materials.some((value) => matchesMaterial(item, value))
  )
    return false;
  if (
    filters.materialType &&
    inferDiscoveryMaterialType(item) !== filters.materialType
  )
    return false;
  if (
    filters.sourceCategory &&
    inferDiscoverySourceCategory(item) !== filters.sourceCategory
  )
    return false;
  if (
    requestedValues(filters.sourceQuality).length &&
    !requestedValues(filters.sourceQuality).includes(inferCredibility(item))
  )
    return false;
  if (filters.contentLength && item.contentLength !== filters.contentLength)
    return false;
  if (filters.captions && item.captionsAvailable !== true) return false;
  if (filters.transcript && item.transcriptAvailable !== true) return false;

  const cutoff = freshnessCutoff(filters.freshness);
  if (cutoff !== null) {
    const publishedAt = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    if (!Number.isFinite(publishedAt) || publishedAt < cutoff) return false;
  }
  return true;
}

function relevanceScore(item: DiscoveryCandidate, query: string) {
  const normalizedQuery = normalized(query);
  const title = normalized(item.title);
  const description = normalized(item.description);
  const subject = normalized(item.subject);
  const source = normalized(item.source);
  const url = normalized(item.url);
  let score = 0;
  const queryMetadata = normalizeResourceMetadata({ title: query });
  const itemMetadata =
    item.normalizedMetadata ?? normalizeResourceMetadata(item);
  if (
    queryMetadata.courses.some(
      (course) => course !== "general" && itemMetadata.courses.includes(course),
    )
  )
    score += 70;
  if (
    queryMetadata.subjects.some(
      (subject) =>
        subject !== "other" && itemMetadata.subjects.includes(subject),
    )
  )
    score += 35;
  if (
    queryMetadata.providers.some(
      (provider) =>
        provider !== "unknown" && itemMetadata.providers.includes(provider),
    )
  )
    score += 25;
  if (title === normalizedQuery) score += 100;
  else if (normalizedQuery && title.includes(normalizedQuery)) score += 45;
  for (const rawTerm of meaningfulSearchTerms(query, 12)) {
    const term = normalized(rawTerm);
    if (!term) continue;
    if (title.includes(term)) score += 12;
    if (subject.includes(term)) score += 7;
    if (description.includes(term)) score += 4;
    if (source.includes(term)) score += 3;
    if (url.includes(term)) score += 2;
  }
  return score;
}

export function filterRankAndDedupeDiscovery<T extends DiscoveryCandidate>(
  items: T[],
  filters: DiscoveryFilterOptions,
): Array<
  T & {
    materialType: DiscoveryMaterialType;
    sourceCategory: DiscoverySourceCategory;
  }
> {
  const byUrl = new Map<
    string,
    T & {
      materialType: DiscoveryMaterialType;
      sourceCategory: DiscoverySourceCategory;
      score: number;
      inputIndex: number;
    }
  >();

  items.forEach((item, inputIndex) => {
    const enriched = {
      ...item,
      materialType: inferDiscoveryMaterialType(item),
      sourceCategory: inferDiscoverySourceCategory(item),
      normalizedMetadata: normalizeResourceMetadata(item),
      score: relevanceScore(item, filters.query),
      inputIndex,
    };
    if (!matchesDiscoveryFilters(enriched, filters)) return;
    const key = canonicalDiscoveryUrl(item.url);
    const previous = byUrl.get(key);
    if (!previous || enriched.score > previous.score) byUrl.set(key, enriched);
  });

  const remaining = [...byUrl.values()].sort(
    (first, second) =>
      second.score - first.score || first.inputIndex - second.inputIndex,
  );
  const hostCounts = new Map<string, number>();
  const categoryCounts = new Map<DiscoverySourceCategory, number>();
  const ranked = remaining
    .map((item) => {
      const host = hostname(item.url);
      const hostPenalty = (hostCounts.get(host) ?? 0) * 7;
      const categoryCount = categoryCounts.get(item.sourceCategory) ?? 0;
      const diversityBonus = categoryCount === 0 ? 6 : 0;
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
      categoryCounts.set(item.sourceCategory, categoryCount + 1);
      return {
        ...item,
        adjustedScore:
          item.score - hostPenalty - categoryCount + diversityBonus,
      };
    })
    .sort(
      (first, second) =>
        second.adjustedScore - first.adjustedScore ||
        second.score - first.score ||
        first.inputIndex - second.inputIndex,
    );

  return ranked
    .slice(0, filters.limit ?? 48)
    .map(({ score, adjustedScore, inputIndex, ...item }) => item) as Array<
    T & {
      materialType: DiscoveryMaterialType;
      sourceCategory: DiscoverySourceCategory;
    }
  >;
}

export function discoveryCoverageInstructions(page: number) {
  const longTail =
    page > 1
      ? "This is a long-tail page: avoid the obvious first-page domains and find additional niche, local, specialist, community, and archival matches."
      : "Cover the strongest matches from every applicable lane; do not stop after finding mainstream platforms.";
  return `${longTail}
Run multiple targeted web searches across all applicable lanes before choosing results:
1. Academic and official: universities, schools, libraries, museums, government agencies, scholarly repositories, journals, and faculty course pages.
2. Open education: OER repositories, open textbooks, public courseware, lesson banks, and reusable teaching collections.
3. Learning documents: class and lecture notes, study guides, worksheets, problem sets, example questions, practice exams, answer keys, slides, handouts, lab manuals, and public PDFs or documents.
4. Public social and community knowledge: directly relevant public posts, threads, pages, channels, profiles, and attachments across Reddit, YouTube, TikTok, Instagram, X/Twitter, Facebook, LinkedIn, Bluesky, Mastodon and the wider Fediverse, Threads, Tumblr, Pinterest, Twitch, public Telegram or Discord surfaces, specialist forums, Q&A sites, study groups, educator communities, and any other publicly indexed social or community platform.
5. Archives and libraries: Internet Archive, national and university libraries, historical collections, public-domain works, and cached institutional collections.
6. Independent educators and media: educator websites, video and streaming platforms, podcasts, newsletters, blogs, tutorials, creator storefronts, and small specialist publishers.
7. Practical resources: GitHub repositories, notebooks, simulations, datasets, calculators, interactive labs, and educational software.
8. Books and research: textbooks, monographs, papers, preprints, theses, reports, and reference works.
Use targeted operators where useful, including exact phrases, filetype:pdf, platform-specific site: searches across applicable social networks, site:github.com, site:archive.org, and relevant academic or government domains. Do not treat the named platforms as a closed list: search other indexed networks and regional platforms when they are relevant to the query and requested language. A social or community-hosted result is eligible when its direct page is publicly accessible without joining a private group, lawful, directly relevant, and safe; rank it by evidence and usefulness instead of excluding it merely for being user-created. Exclude private or login-only posts, leaked exams, pirated copies, unsafe downloads, link farms, SEO spam, generic search pages, and results whose actual page does not match the title.`;
}
