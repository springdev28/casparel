/**
 * @fileOverview Backend domain role: centralizes Resource Preview logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
export const RESOURCE_PREVIEW_SOURCES = [
  "provider_api",
  "oembed",
  "opengraph",
  "extracted",
  "none",
] as const;

export type ResourcePreviewSource = (typeof RESOURCE_PREVIEW_SOURCES)[number];

export type ResourcePreview = {
  previewTitle: string | null;
  previewDescription: string | null;
  previewImageUrl: string | null;
  previewAuthor: string | null;
  previewPublisher: string | null;
  previewPublishedAt: string | null;
  previewUpdatedAt: string | null;
  previewFaviconUrl: string | null;
  previewSource: ResourcePreviewSource;
  previewCheckedAt: string;
  previewMeaningful: boolean;
};

type PreviewCandidate = {
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  author?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  faviconUrl?: string | null;
  source?: ResourcePreviewSource;
  checkedAt?: string;
};

function cleanText(value: string | null | undefined, maxLength: number) {
  // Preview metadata is display-only and must remain bounded before it reaches
  // the database or client. This intentionally performs conservative text
  // cleanup rather than trying to preserve arbitrary publisher HTML.
  const cleaned = (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (match, code: string) => {
      const point = Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function absoluteHttpUrl(value: string | null | undefined, pageUrl: string) {
  if (!value) return null;
  try {
    const url = new URL(value, pageUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function httpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function readTagAttribute(tag: string, attribute: string) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`${escaped}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? "";
}

function readMeta(html: string, ...keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (
      readTagAttribute(tag, "property") || readTagAttribute(tag, "name")
    ).toLowerCase();
    if (wanted.has(key)) return readTagAttribute(tag, "content");
  }
  return "";
}

function readFavicon(html: string, pageUrl: string) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = readTagAttribute(tag, "rel").toLowerCase().split(/\s+/);
    if (!rel.some((value) => value === "icon" || value === "shortcut"))
      continue;
    const resolved = absoluteHttpUrl(readTagAttribute(tag, "href"), pageUrl);
    if (resolved) return resolved;
  }
  return null;
}

function normalizedDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function isMeaningfulResourcePreview(
  preview: Pick<
    ResourcePreview,
    | "previewImageUrl"
    | "previewDescription"
    | "previewAuthor"
    | "previewPublisher"
  >,
) {
  // A title or favicon alone adds little beyond the resource card itself. Treat
  // a preview as useful only when it adds visual context, or enough descriptive
  // text plus an attributable author/publisher.
  if (preview.previewImageUrl) return true;
  const descriptionLength = preview.previewDescription?.trim().length ?? 0;
  return (
    descriptionLength >= 16 &&
    Boolean(preview.previewAuthor || preview.previewPublisher)
  );
}

export function normalizeResourcePreview(
  candidate: PreviewCandidate,
): ResourcePreview {
  // Every provider and HTML fallback enters through one normalization boundary,
  // keeping cache rows and API responses identical regardless of their source.
  const preview = {
    previewTitle: cleanText(candidate.title, 160),
    previewDescription: cleanText(candidate.description, 500),
    previewImageUrl: httpUrl(candidate.imageUrl),
    previewAuthor: cleanText(candidate.author, 160),
    previewPublisher: cleanText(candidate.publisher, 160),
    previewPublishedAt: normalizedDate(candidate.publishedAt),
    previewUpdatedAt: normalizedDate(candidate.updatedAt),
    previewFaviconUrl: httpUrl(candidate.faviconUrl),
    previewSource: candidate.source ?? ("none" as const),
    previewCheckedAt: candidate.checkedAt ?? new Date().toISOString(),
  };
  return {
    ...preview,
    previewMeaningful: isMeaningfulResourcePreview(preview),
  };
}

export function extractHtmlResourcePreview(
  html: string,
  pageUrl: string,
  checkedAt = new Date().toISOString(),
) {
  // Prefer publisher-declared Open Graph/Twitter values, then fall back to
  // ordinary document metadata. The caller is responsible for safe fetching;
  // this pure function only parses an already-bounded HTML string.
  const ogTitle = readMeta(html, "og:title", "twitter:title");
  const ogDescription = readMeta(html, "og:description", "twitter:description");
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const title = ogTitle || titleTag;
  const description =
    ogDescription || readMeta(html, "description", "dc.description");
  const imageUrl = absoluteHttpUrl(
    readMeta(html, "og:image:secure_url", "og:image", "twitter:image"),
    pageUrl,
  );
  const author = readMeta(html, "author", "article:author", "book:author");
  const publisher = readMeta(
    html,
    "og:site_name",
    "application-name",
    "publisher",
  );
  const publishedAt = readMeta(
    html,
    "article:published_time",
    "date",
    "dc.date",
  );
  const updatedAt = readMeta(html, "article:modified_time", "last-modified");
  const hasOpenGraph = Boolean(
    ogTitle || ogDescription || imageUrl || readMeta(html, "og:site_name"),
  );

  return normalizeResourcePreview({
    title,
    description,
    imageUrl,
    author,
    publisher,
    publishedAt,
    updatedAt,
    faviconUrl: readFavicon(html, pageUrl),
    source: hasOpenGraph
      ? "opengraph"
      : title || description
        ? "extracted"
        : "none",
    checkedAt,
  });
}

export function resourcePreviewCoverage(
  items: readonly { previewMeaningful?: boolean }[],
) {
  if (items.length === 0) return 0;
  const meaningful = items.filter((item) => item.previewMeaningful).length;
  return meaningful / items.length;
}
