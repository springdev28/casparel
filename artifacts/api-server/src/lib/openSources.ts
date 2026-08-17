/**
 * Open-access sources beyond the wikis.
 *
 * The catalog had four live sources, all of them MediaWiki, and a reader who
 * excluded the biggest one was left with very little. Four wikis is also the
 * wrong *shape* of library: they hold encyclopedia articles, textbooks and
 * primary texts, and nothing peer-reviewed. A sixth-former writing about
 * photosynthesis wants a textbook chapter *and* a paper, and neither Wikibooks
 * nor Wikipedia has the second.
 *
 * Each source here is genuinely open access — the link a reader follows leads to
 * something they can read, not a paywall. That is the whole point of the
 * catalog, and it is why Crossref is not in this list despite being far larger
 * than any of these: it indexes everything, most of which is behind a paywall.
 *
 * One description of a source, not one importer per source. The machinery an
 * importer needs — pacing, a cooldown after a failure, collapsing concurrent
 * identical requests, respecting the catalog's size cap, recording what
 * happened — is identical everywhere and was already written twice. A source
 * here says only what is particular to it: how to ask, and how to read the
 * answer.
 */

import type { InsertCatalogResource } from "@workspace/db";

/** What kind of thing a source produces, for the reader's material filter. */
export type MaterialKind = "book" | "course" | "reference" | "paper" | "primary";

export type OpenSource = {
  /** Stored in source_kind, and the cooldown key. */
  kind: "doab" | "doaj" | "europepmc";
  /** Provider name as a reader sees it. */
  provider: string;
  providerUrl: string;
  /** Host, for request pacing. One queue per service. */
  host: string;
  material: MaterialKind;
  /** Rows requested per window. */
  pageSize: number;
  /** The request for one window of a query. */
  endpoint(query: string, offset: number, pageSize: number): URL;
  /** Rows from one response body. Anything unusable is dropped, never guessed. */
  parse(body: unknown): ParsedResource[];
};

/** A row as a source describes it, before the shared fields are filled in. */
export type ParsedResource = {
  externalId: string;
  url: string;
  title: string;
  description: string;
  author?: string | null;
  subject?: string | null;
  language?: string | null;
  license?: string | null;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
  format: InsertCatalogResource["format"];
};

const MAX_DESCRIPTION = 600;

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function clamp(value: string, max = MAX_DESCRIPTION): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** A year on its own is not a timestamp; Postgres needs a real instant. */
function yearStart(year: unknown): string | null {
  const parsed = Number(text(year));
  return Number.isInteger(parsed) && parsed > 1000 && parsed <= 2200
    ? `${parsed}-01-01T00:00:00.000Z`
    : null;
}

/**
 * Subjects the catalog already speaks.
 *
 * The same list the wiki importer works from, and for the same reason: a source
 * that files a work under "TP500-660 Fermentation industries" or "thema
 * EDItEUR::PST Botany" is describing it to a librarian, and storing that verbatim
 * gives the catalog a second vocabulary nobody searches in.
 */
const KNOWN_SUBJECTS = [
  "Astronomy",
  "Biology",
  "Chemistry",
  "Computer Science",
  "Earth Science",
  "Economics",
  "Engineering",
  "Geography",
  "History",
  "Languages",
  "Law",
  "Literature",
  "Mathematics",
  "Medicine",
  "Music",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Sociology",
  "Statistics",
  "Writing",
];

/** Words a source's own classification uses for a subject the catalog knows. */
const SUBJECT_HINTS: Array<[RegExp, string]> = [
  [/\b(?:botany|plant sciences?|zoolog|genetic|ecolog|biolog|biochem|microbiol)/i, "Biology"],
  [/\b(?:chemistr|chemical)/i, "Chemistry"],
  [/\b(?:physics|astrophys|quantum)/i, "Physics"],
  [/\b(?:astronom|cosmolog)/i, "Astronomy"],
  [/\b(?:mathemat|algebra|geometry|calculus|topolog)/i, "Mathematics"],
  [/\b(?:statistic|probabilit)/i, "Statistics"],
  [/\b(?:comput|informatic|software|algorithm)/i, "Computer Science"],
  [/\b(?:medicin|medical|clinical|health|nursing|pharmac|surg)/i, "Medicine"],
  [/\b(?:engineer|mechanic|electronic)/i, "Engineering"],
  [/\b(?:econom|finance)/i, "Economics"],
  [/\b(?:geolog|earth science|climat|meteorolog|oceanograph)/i, "Earth Science"],
  [/\b(?:geograph)/i, "Geography"],
  [/\b(?:histor|archaeolog)/i, "History"],
  [/\b(?:philosoph|ethic)/i, "Philosophy"],
  [/\b(?:psycholog)/i, "Psychology"],
  [/\b(?:sociolog|social science)/i, "Sociology"],
  [/\b(?:politic|government)/i, "Political Science"],
  [/\b(?:law|legal|jurisprud)/i, "Law"],
  [/\b(?:literature|poetry|fiction|linguistic)/i, "Literature"],
  [/\b(?:languages?|grammar)/i, "Languages"],
  [/\b(?:music)/i, "Music"],
];

/**
 * The subject a source's own classification names, or nothing.
 *
 * Nothing is a perfectly good answer. A wrong subject is worse than none,
 * because a later search matches on it — the catalog once filed everything it
 * imported under the searcher's own query and answered "AP Physics C" with
 * wireless telegraphy for weeks afterwards.
 */
export function subjectFromTerms(terms: string[]): string | null {
  for (const term of terms) {
    const exact = KNOWN_SUBJECTS.find(
      (subject) => subject.toLowerCase() === term.trim().toLowerCase(),
    );
    if (exact) return exact;
  }
  for (const term of terms)
    for (const [pattern, subject] of SUBJECT_HINTS)
      if (pattern.test(term)) return subject;
  return null;
}

/** Titles that are a placeholder rather than a work. */
function isUsableTitle(title: string): boolean {
  if (title.length < 3 || title.length > 300) return false;
  return !/^(?:untitled|no title|n\/?a)$/i.test(title);
}

/**
 * Directory of Open Access Books.
 *
 * Academic books, all of them free to read in full — the closest thing to a
 * textbook shelf any of these sources has, which is why it is first.
 */
const doab: OpenSource = {
  kind: "doab",
  provider: "Directory of Open Access Books",
  providerUrl: "https://directory.doabooks.org/",
  host: "directory.doabooks.org",
  material: "book",
  // The response carries the full Dublin Core record for every hit, so a large
  // window is megabytes. Twenty is plenty for a page of sixteen.
  pageSize: 20,
  endpoint(query, offset, pageSize) {
    const url = new URL("https://directory.doabooks.org/rest/search");
    url.searchParams.set("query", query);
    url.searchParams.set("expand", "metadata");
    url.searchParams.set("limit", String(pageSize));
    if (offset) url.searchParams.set("offset", String(offset));
    return url;
  },
  parse(body) {
    if (!Array.isArray(body)) return [];
    const rows: ParsedResource[] = [];
    for (const entry of body) {
      const record = entry as {
        uuid?: unknown;
        handle?: unknown;
        metadata?: Array<{ key?: unknown; value?: unknown }>;
      };
      const fields = new Map<string, string[]>();
      for (const field of record.metadata ?? []) {
        const key = text(field.key);
        const value = text(field.value);
        if (!key || !value) continue;
        fields.set(key, [...(fields.get(key) ?? []), value]);
      }
      const first = (key: string) => fields.get(key)?.[0] ?? "";
      const title = first("dc.title");
      const handle = text(record.handle);
      if (!isUsableTitle(title) || !handle) continue;
      const abstract = first("dc.description.abstract");
      rows.push({
        externalId: `doab:${text(record.uuid) || handle}`,
        url: `https://directory.doabooks.org/handle/${handle}`,
        title,
        description: abstract
          ? clamp(abstract)
          : `An open access academic book, free to read in full.`,
        author:
          first("dc.contributor.author") ||
          first("dc.contributor.editor") ||
          null,
        subject: subjectFromTerms([
          ...(fields.get("dc.subject.other") ?? []),
          ...(fields.get("dc.subject.classification") ?? []),
        ]),
        language: /^en/i.test(first("dc.language")) ? "en" : null,
        license: first("dc.rights") || "Open access; see the book for its licence",
        publishedAt: yearStart(first("dc.date.issued").slice(0, 4)),
        format: "pdf",
      });
    }
    return rows;
  },
};

/**
 * Directory of Open Access Journals.
 *
 * Peer-reviewed articles a reader can actually open. DOAJ only lists journals
 * that are fully open access, so there is no paywall to walk into.
 */
const doaj: OpenSource = {
  kind: "doaj",
  provider: "Directory of Open Access Journals",
  providerUrl: "https://doaj.org/",
  host: "doaj.org",
  material: "paper",
  pageSize: 30,
  endpoint(query, offset, pageSize) {
    // DOAJ pages by page number, not row offset.
    const page = Math.floor(offset / pageSize) + 1;
    const url = new URL(
      `https://doaj.org/api/search/articles/${encodeURIComponent(query)}`,
    );
    url.searchParams.set("pageSize", String(pageSize));
    if (page > 1) url.searchParams.set("page", String(page));
    return url;
  },
  parse(body) {
    const results = (body as { results?: unknown[] })?.results;
    if (!Array.isArray(results)) return [];
    const rows: ParsedResource[] = [];
    for (const entry of results) {
      const article = (entry as { bibjson?: Record<string, unknown> }).bibjson;
      if (!article) continue;
      const title = text(article.title);
      const links = Array.isArray(article.link) ? article.link : [];
      const fullText = links.find(
        (link) => text((link as { type?: unknown }).type) === "fulltext",
      ) as { url?: unknown } | undefined;
      const doi = (
        Array.isArray(article.identifier) ? article.identifier : []
      ).find((id) => text((id as { type?: unknown }).type) === "doi") as
        | { id?: unknown }
        | undefined;
      const url = text(fullText?.url) || (doi ? `https://doi.org/${text(doi.id)}` : "");
      if (!isUsableTitle(title) || !/^https?:\/\//i.test(url)) continue;
      const journal = (article.journal ?? {}) as Record<string, unknown>;
      const authors = (Array.isArray(article.author) ? article.author : [])
        .map((author) => text((author as { name?: unknown }).name))
        .filter(Boolean)
        .slice(0, 6)
        .join(", ");
      const abstract = text(article.abstract);
      rows.push({
        externalId: `doaj:${text(doi?.id) || url}`,
        url,
        title,
        description: abstract
          ? clamp(abstract)
          : `A peer-reviewed open access article${text(journal.title) ? ` in ${text(journal.title)}` : ""}.`,
        author: authors || null,
        subject: subjectFromTerms([
          ...(Array.isArray(article.keywords) ? article.keywords.map(text) : []),
          ...(Array.isArray(article.subject)
            ? article.subject.map((s) => text((s as { term?: unknown }).term))
            : []),
        ]),
        language: (Array.isArray(journal.language) ? journal.language : []).some(
          (code) => /^en$/i.test(text(code)),
        )
          ? "en"
          : null,
        license: "Open access; see the article for its licence",
        publishedAt: yearStart(article.year),
        format: "article",
      });
    }
    return rows;
  },
};

/**
 * Europe PMC, restricted to what is open.
 *
 * Life sciences and medicine, which is where school biology questions live and
 * where the wikis are thinnest on anything current. The query is constrained to
 * open-access records, so a link is never a paywall.
 */
const europePmc: OpenSource = {
  kind: "europepmc",
  provider: "Europe PMC",
  providerUrl: "https://europepmc.org/",
  host: "www.ebi.ac.uk",
  material: "paper",
  pageSize: 30,
  endpoint(query, offset, pageSize) {
    const page = Math.floor(offset / pageSize) + 1;
    const url = new URL(
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
    );
    // OPEN_ACCESS:Y is the whole reason this source belongs in an open catalog.
    url.searchParams.set("query", `${query} AND OPEN_ACCESS:Y`);
    url.searchParams.set("format", "json");
    url.searchParams.set("resultType", "core");
    url.searchParams.set("pageSize", String(pageSize));
    if (page > 1) url.searchParams.set("page", String(page));
    return url;
  },
  parse(body) {
    const results = (body as { resultList?: { result?: unknown[] } })?.resultList
      ?.result;
    if (!Array.isArray(results)) return [];
    const rows: ParsedResource[] = [];
    for (const entry of results) {
      const record = entry as Record<string, unknown>;
      // Trailing full stops are part of the record, not the title.
      const title = text(record.title).replace(/\.$/, "");
      const pmcid = text(record.pmcid);
      const doi = text(record.doi);
      const url = pmcid
        ? `https://europepmc.org/article/PMC/${pmcid}`
        : doi
          ? `https://doi.org/${doi}`
          : "";
      if (!isUsableTitle(title) || !url) continue;
      const abstract = text(record.abstractText);
      const journal = text(
        (
          (record.journalInfo as { journal?: { title?: unknown } })?.journal ??
          {}
        ).title,
      );
      const mesh = (
        (record.meshHeadingList as { meshHeading?: unknown[] })?.meshHeading ??
        []
      ).map((heading) => text((heading as { descriptorName?: unknown })?.descriptorName));
      rows.push({
        externalId: `europepmc:${text(record.id) || url}`,
        url,
        title,
        description: abstract
          ? clamp(abstract)
          : `An open access research article${journal ? ` in ${journal}` : ""}.`,
        author: text(record.authorString) || null,
        // Europe PMC is life sciences, so Biology is the honest fallback rather
        // than a guess: every record here is in that field.
        subject: subjectFromTerms(mesh) ?? "Biology",
        language: /^eng?$/i.test(text(record.language)) ? "en" : null,
        license: "Open access; see the article for its licence",
        publishedAt: yearStart(record.pubYear),
        format: "article",
      });
    }
    return rows;
  },
};

export const OPEN_SOURCES: OpenSource[] = [doab, doaj, europePmc];

/** Whether a reader's exclusion covers this source. */
export function openSourceIsExcluded(
  source: OpenSource,
  excludeSource: string | undefined,
): boolean {
  const needle = excludeSource?.trim().toLowerCase();
  if (!needle) return false;
  return (
    source.provider.toLowerCase().includes(needle) ||
    source.providerUrl.toLowerCase().includes(needle) ||
    source.host.toLowerCase().includes(needle) ||
    source.kind.includes(needle)
  );
}
