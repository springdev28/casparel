/**
 * @fileOverview Backend domain role: centralizes Open Sources logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
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
export type MaterialKind =
  | "book"
  | "course"
  | "reference"
  | "paper"
  | "primary"
  | "video";

export type OpenSource = {
  /** Stored in source_kind, and the cooldown key. */
  kind:
    | "doab"
    | "doaj"
    | "europepmc"
    | "arxiv"
    | "openalex"
    | "gutenberg"
    | "internet-archive"
    | "youtube";
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
  /**
   * Rows from one response body. Anything unusable is dropped, never guessed.
   *
   * Given text rather than parsed JSON when `responseType` says so, because one
   * of these sources answers in Atom.
   */
  parse(body: unknown): ParsedResource[];
  /** How to hand the response to `parse`. JSON unless stated. */
  responseType?: "json" | "text";
  /**
   * A second request, for what the first could not say.
   *
   * Split into a request and a merge so that pacing, timeouts and the identity
   * we send stay in one place with every other request the catalog makes, and
   * a source only has to know what to ask and what the answer means.
   *
   * It is always optional in the strong sense: whatever it would have added,
   * the rows are already storable without it, and the importer treats a failure
   * here as nothing happening rather than as the search failing.
   */
  enrich?: {
    /** The follow-up, or null when there is nothing worth asking about. */
    endpoint(rows: ParsedResource[]): URL | null;
    /** The same rows, with whatever the answer added to them. */
    apply(rows: ParsedResource[], body: unknown): ParsedResource[];
  };
  /**
   * How long this source may take. Six seconds unless stated: a source that
   * cannot answer in that is not worth a reader waiting for when eleven others
   * can. Raised only where the service is genuinely slow *and* worth it.
   */
  timeoutMs?: number;
  /**
   * Whether this source can be asked at all. A source needing a key that is not
   * configured is skipped rather than asked and failing.
   */
  available?(): boolean;
  /**
   * Told when the importer is about to actually issue a request, so a source
   * that has to ration something can count it.
   *
   * Separate from `endpoint`, which is called by tests and by nothing else of
   * consequence: building a URL is not spending anything, and a counter that
   * moved when a URL was built would drift every time the shape of a request
   * was checked.
   */
  onRequest?(kind: "search" | "enrich"): void;
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

/**
 * A year on its own is not a timestamp; Postgres needs a real instant.
 *
 * Accepts a number as well as a string: OpenAlex sends `publication_year: 2018`
 * and reading only strings silently dropped the date off every record.
 */
function yearStart(year: unknown): string | null {
  const parsed = Number(typeof year === "number" ? year : text(year));
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
  [
    /\b(?:botany|plant|physiolog|zoolog|genetic|ecolog|biolog|biochem|microbiol|photosynth|cell)/i,
    "Biology",
  ],
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
  // History is the subject people label least by name. A chemistry video is
  // tagged "chemistry"; a video about the Berlin Wall is tagged "berlin wall",
  // "cold war" and "germany", and only rarely "history" — which left more than
  // half the history videos measured with no subject at all while chemistry
  // and biology classified freely. These are the periods and events, which is
  // how the subject actually gets named.
  //
  // "Revolution" and "empire" are deliberately absent, having been tried and
  // measured: they file "Digital Revolution: How Computers Changed the World"
  // and "The Empire State Building, an Engineering Miracle" under History.
  // "Monarchy" rather than "monarch", which is a butterfly.
  [
    /\b(?:histor|archaeolog|ancient|medieval|renaissance|antiquity|prehistor|colonial|crusade|dynast|civili[sz]ation|world war|civil war|cold war|ww[12i]|monarchy)/i,
    "History",
  ],
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

/**
 * Every subject one phrase names — usually one, sometimes none, and
 * occasionally more than one.
 *
 * More than one is the interesting case. "A brief history of english
 * literature" names History and Literature both, and `subjectFromTerms` hands
 * back whichever the hint table happens to list first, which is History for no
 * reason anybody could defend. A lecture on the themes of Hamlet was filed
 * under History on exactly that.
 */
function subjectsNamedBy(term: string): string[] {
  const exact = KNOWN_SUBJECTS.find(
    (subject) => subject.toLowerCase() === term.trim().toLowerCase(),
  );
  if (exact) return [exact];
  const named = new Set<string>();
  for (const [pattern, subject] of SUBJECT_HINTS)
    if (pattern.test(term)) named.add(subject);
  return [...named];
}

/**
 * The subjects where a peer-reviewed paper is a normal thing to be handed.
 *
 * Not a judgement about which fields are serious. It is about what a reader
 * asking a question in each field is *for*: someone searching "photosynthesis"
 * is doing science and a paper belongs beside the textbook, while someone
 * searching "hamlet soliloquy folio" wants the play, and six preprints analysing
 * it — which is what they got — is the catalog answering a question nobody asked.
 */
const RESEARCH_SUBJECTS = new Set([
  "Astronomy",
  "Biology",
  "Chemistry",
  "Computer Science",
  "Earth Science",
  "Engineering",
  "Mathematics",
  "Medicine",
  "Physics",
  "Statistics",
]);

/**
 * Whether a query is asking about a field where papers are wanted by default.
 *
 * Read from the same vocabulary the importers file works under, so the answer
 * cannot drift from how the catalog is actually organised. A query naming
 * nothing at all counts as not scientific: "how to revise for exams" wants study
 * material, not literature reviews.
 */
export function queryWantsResearch(terms: string[]): boolean {
  const subject = subjectFromTerms(terms);
  return subject !== null && RESEARCH_SUBJECTS.has(subject);
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
  // The response carries the full Dublin Core record for every hit, so the
  // window size decides the payload: twenty records is over a megabyte and took
  // longer than the timeout allows, ten is 120KB and answers in about three
  // seconds. Ten is plenty when eleven other sources are also contributing.
  pageSize: 10,
  // Slow even so, and worth waiting for: it is the only source here that is
  // entirely open academic books.
  timeoutMs: 10_000,
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


/**
 * Reading one field out of an Atom or XML element.
 *
 * arXiv answers in Atom and nothing here pulls in an XML parser for one source.
 * That is a deliberate trade with a real limit: this understands the shape arXiv
 * actually sends — flat elements, no nesting, no CDATA — and an entry it cannot
 * read is dropped rather than half-parsed.
 */
function xmlField(entry: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(entry);
  return match ? unescapeXml(match[1]) : "";
}

/**
 * The href of the `<link>` with a given rel.
 *
 * arXiv gives an entry several links — the abstract page, the pdf, sometimes a
 * DOI — and which one a reader should follow depends on the rel, not on the
 * order. Picking by position or falling back to `<id>` hands out an http:// URL
 * for a site that serves https.
 */
function xmlLinkHref(entry: string, rel: string): string {
  for (const match of entry.matchAll(/<link\b([^>]*)\/?>/g)) {
    const attributes = match[1] ?? "";
    if (!new RegExp(`\\brel="${rel}"`).test(attributes)) continue;
    const href = /\bhref="([^"]*)"/.exec(attributes);
    if (href) return unescapeXml(href[1] ?? "");
  }
  return "";
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * arXiv.
 *
 * Preprints in physics, mathematics and computer science, every one of them free
 * to read in full. Where the wikis stop being useful for an advanced student.
 */
const arxiv: OpenSource = {
  kind: "arxiv",
  provider: "arXiv",
  providerUrl: "https://arxiv.org/",
  host: "export.arxiv.org",
  material: "paper",
  pageSize: 25,
  responseType: "text",
  endpoint(query, offset, pageSize) {
    const url = new URL("https://export.arxiv.org/api/query");
    url.searchParams.set("search_query", `all:${query}`);
    url.searchParams.set("start", String(offset));
    url.searchParams.set("max_results", String(pageSize));
    return url;
  },
  parse(body) {
    if (typeof body !== "string") return [];
    const rows: ParsedResource[] = [];
    for (const chunk of body.split("<entry>").slice(1)) {
      const entry = chunk.split("</entry>")[0] ?? "";
      const title = xmlField(entry, "title");
      // The abstract page, not the pdf: it carries the abstract, the authors and
      // a link to every format the paper is available in.
      const link =
        xmlLinkHref(entry, "alternate") ||
        // The id is a last resort: arXiv writes it with an http:// scheme.
        xmlField(entry, "id").replace(/^http:/, "https:");
      if (!isUsableTitle(title) || !/^https?:\/\//i.test(link)) continue;
      const summary = xmlField(entry, "summary");
      const categories = [...entry.matchAll(/<category[^>]*\bterm="([^"]*)"/g)].map(
        (match) => match[1] ?? "",
      );
      rows.push({
        externalId: `arxiv:${xmlField(entry, "id") || link}`,
        url: link,
        title,
        description: summary
          ? clamp(summary)
          : "A preprint on arXiv, free to read in full.",
        author: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)]
          .map((match) => unescapeXml(match[1] ?? ""))
          .filter(Boolean)
          .slice(0, 6)
          .join(", "),
        subject: subjectFromTerms([...categories, ...ARXIV_CATEGORY_HINTS(categories)]),
        language: "en",
        license: "arXiv distribution licence; see the paper",
        publishedAt: yearStart(xmlField(entry, "published").slice(0, 4)),
        format: "pdf",
      });
    }
    return rows;
  },
};

/**
 * arXiv files papers under its own codes, which name a field but not in words.
 */
const ARXIV_CATEGORY_HINTS = (categories: string[]): string[] =>
  categories.map((category) => {
    const prefix = category.split(".")[0] ?? "";
    return (
      {
        "astro-ph": "Astronomy",
        "cond-mat": "Physics",
        "gr-qc": "Physics",
        "hep-ex": "Physics",
        "hep-lat": "Physics",
        "hep-ph": "Physics",
        "hep-th": "Physics",
        "math-ph": "Physics",
        "nucl-ex": "Physics",
        "nucl-th": "Physics",
        "quant-ph": "Physics",
        physics: "Physics",
        math: "Mathematics",
        cs: "Computer Science",
        "q-bio": "Biology",
        "q-fin": "Economics",
        stat: "Statistics",
        econ: "Economics",
        eess: "Engineering",
      }[prefix] ?? ""
    );
  }).filter(Boolean);

/**
 * OpenAlex, restricted to what is open.
 *
 * The broadest scholarly index with a trustworthy open-access flag, which is why
 * it is here and Crossref is not: Crossref indexes everything, most of it behind
 * a paywall, and there is no reliable way to tell from its metadata whether a
 * reader can actually open the thing.
 */
const openalex: OpenSource = {
  kind: "openalex",
  provider: "OpenAlex",
  providerUrl: "https://openalex.org/",
  host: "api.openalex.org",
  material: "paper",
  pageSize: 25,
  endpoint(query, offset, pageSize) {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", query);
    // is_oa is the whole reason this belongs in an open catalog.
    url.searchParams.set("filter", "is_oa:true");
    url.searchParams.set("per-page", String(pageSize));
    url.searchParams.set("page", String(Math.floor(offset / pageSize) + 1));
    if (process.env.CATALOG_CONTACT_EMAIL)
      url.searchParams.set("mailto", process.env.CATALOG_CONTACT_EMAIL);
    return url;
  },
  parse(body) {
    const results = (body as { results?: unknown[] })?.results;
    if (!Array.isArray(results)) return [];
    const rows: ParsedResource[] = [];
    for (const entry of results) {
      const work = entry as Record<string, unknown>;
      const title = text(work.display_name ?? work.title);
      const access = (work.best_oa_location ?? work.primary_location ?? {}) as {
        landing_page_url?: unknown;
        pdf_url?: unknown;
      };
      const url =
        text(access.landing_page_url) ||
        text(access.pdf_url) ||
        text(work.doi);
      if (!isUsableTitle(title) || !/^https?:\/\//i.test(url)) continue;
      const concepts = (
        Array.isArray(work.concepts) ? work.concepts : []
      ).map((concept) => text((concept as { display_name?: unknown })?.display_name));
      rows.push({
        externalId: `openalex:${text(work.id) || url}`,
        url,
        title,
        // OpenAlex often has no abstract it may redistribute, so the description
        // says what the record is rather than inventing prose for it.
        description: clamp(
          text(work.abstract) ||
            `An open access ${text(work.type) || "work"}${
              text(
                (work.primary_location as { source?: { display_name?: unknown } })
                  ?.source?.display_name,
              )
                ? ` in ${text((work.primary_location as { source?: { display_name?: unknown } }).source?.display_name)}`
                : ""
            }.`,
        ),
        author: (Array.isArray(work.authorships) ? work.authorships : [])
          .map((authorship) =>
            text((authorship as { author?: { display_name?: unknown } })?.author?.display_name),
          )
          .filter(Boolean)
          .slice(0, 6)
          .join(", "),
        subject: subjectFromTerms(concepts),
        language: text(work.language) === "en" ? "en" : null,
        license: text(
          (work.best_oa_location as { license?: unknown })?.license,
        ) || "Open access; see the work for its licence",
        publishedAt: yearStart(work.publication_year),
        format: "article",
      });
    }
    return rows;
  },
};

/**
 * Project Gutenberg, through Gutendex.
 *
 * Public-domain literature in full text — the plays, novels and speeches a
 * literature or history question wants to read rather than read about, and the
 * one source here that a fourteen-year-old will use as often as a researcher.
 */
const gutenberg: OpenSource = {
  kind: "gutenberg",
  provider: "Project Gutenberg",
  providerUrl: "https://www.gutenberg.org/",
  host: "gutendex.com",
  material: "primary",
  pageSize: 32,
  // Redirects once and answers in about three seconds.
  timeoutMs: 9000,
  endpoint(query, offset, pageSize) {
    const url = new URL("https://gutendex.com/books");
    url.searchParams.set("search", query);
    url.searchParams.set("page", String(Math.floor(offset / pageSize) + 1));
    return url;
  },
  parse(body) {
    const results = (body as { results?: unknown[] })?.results;
    if (!Array.isArray(results)) return [];
    const rows: ParsedResource[] = [];
    for (const entry of results) {
      const book = entry as Record<string, unknown>;
      const title = text(book.title);
      const id = Number(book.id);
      if (!isUsableTitle(title) || !Number.isInteger(id)) continue;
      const authors = (Array.isArray(book.authors) ? book.authors : [])
        .map((author) => text((author as { name?: unknown })?.name))
        .filter(Boolean);
      const subjects = (
        Array.isArray(book.subjects) ? book.subjects : []
      ).map(text);
      // Gutenberg subjects are Library of Congress strings like "Denmark --
      // Drama", so the part before the dashes is the only usable half.
      const shelves = (Array.isArray(book.bookshelves) ? book.bookshelves : [])
        .map(text)
        .concat(subjects.map((subject) => subject.split("--")[0]?.trim() ?? ""));
      const covers = (book.formats ?? {}) as Record<string, unknown>;
      rows.push({
        externalId: `gutenberg:${id}`,
        url: `https://www.gutenberg.org/ebooks/${id}`,
        title,
        description: `${authors.length ? `${authors.join(", ")}. ` : ""}Free full text from Project Gutenberg${subjects.length ? `. ${subjects.slice(0, 3).join("; ")}` : ""}.`.slice(
          0,
          MAX_DESCRIPTION,
        ),
        author: authors.slice(0, 4).join(", ") || null,
        subject: subjectFromTerms(shelves),
        language: (Array.isArray(book.languages) ? book.languages : []).some(
          (code) => text(code) === "en",
        )
          ? "en"
          : null,
        license: "Public domain in the United States; see the book",
        publishedAt: null,
        thumbnailUrl: text(covers["image/jpeg"]) || null,
        format: "pdf",
      });
    }
    return rows;
  },
};

/**
 * Internet Archive, texts only.
 *
 * Scanned books, journals and reports. Restricted to `mediatype:texts` and to
 * items outside the lending collection: a book you have to join a waiting list
 * for is a paywall with extra steps, and this catalog promises the link opens.
 */
const internetArchive: OpenSource = {
  kind: "internet-archive",
  provider: "Internet Archive",
  providerUrl: "https://archive.org/",
  host: "archive.org",
  material: "book",
  pageSize: 25,
  endpoint(query, offset, pageSize) {
    const url = new URL("https://archive.org/advancedsearch.php");
    url.searchParams.set(
      "q",
      `${query} AND mediatype:texts AND -collection:inlibrary AND -collection:printdisabled`,
    );
    for (const field of [
      "identifier",
      "title",
      "creator",
      "year",
      "subject",
      "description",
      "language",
    ])
      url.searchParams.append("fl[]", field);
    url.searchParams.set("rows", String(pageSize));
    url.searchParams.set("page", String(Math.floor(offset / pageSize) + 1));
    url.searchParams.set("output", "json");
    return url;
  },
  parse(body) {
    const docs = (body as { response?: { docs?: unknown[] } })?.response?.docs;
    if (!Array.isArray(docs)) return [];
    const rows: ParsedResource[] = [];
    for (const entry of docs) {
      const item = entry as Record<string, unknown>;
      const identifier = text(item.identifier);
      const title = text(Array.isArray(item.title) ? item.title[0] : item.title);
      if (!identifier || !isUsableTitle(title)) continue;
      const subjects = (
        Array.isArray(item.subject) ? item.subject : [item.subject]
      ).map(text);
      const description = text(
        Array.isArray(item.description) ? item.description[0] : item.description,
      );
      rows.push({
        externalId: `ia:${identifier}`,
        url: `https://archive.org/details/${identifier}`,
        title,
        description: description
          ? clamp(description)
          : "A scanned text in the Internet Archive, free to read.",
        author: text(
          Array.isArray(item.creator) ? item.creator[0] : item.creator,
        ) || null,
        subject: subjectFromTerms(subjects),
        language: /^(?:eng|en)$/i.test(
          text(Array.isArray(item.language) ? item.language[0] : item.language),
        )
          ? "en"
          : null,
        license: "Rights vary by item; see the item page",
        publishedAt: yearStart(item.year),
        format: "pdf",
      });
    }
    return rows;
  },
};

/**
 * YouTube, needing a key.
 *
 * The only source here that is not open by licence, and it earns its place
 * anyway: a video explanation is what a stuck fourteen-year-old actually wants,
 * and no wiki has one.
 *
 * The key comes from the environment and is never stored in the repository. The
 * free quota is ten thousand units a day and a search costs a hundred, so about
 * a hundred fresh searches — which is why every result is stored: the catalog
 * answers the second reader for nothing.
 */
/** How a video is keyed in the catalog. */
function youtubeExternalId(videoId: string) {
  return `youtube:${videoId}`;
}

/**
 * What YouTube charges, against a daily allowance.
 *
 * A search costs a hundred units and looking videos up costs one, so the
 * default allowance of ten thousand is a hundred searches a day. Not a hundred
 * thousand — a hundred, which a single busy afternoon can spend by teatime,
 * leaving the evening with no videos at all and nothing in the logs to say
 * why.
 *
 * Rationing it here means the last searches of the day are refused knowingly,
 * through the same path that skips a source with no key configured: cleanly,
 * without a failed request, and without resting the provider over something
 * that is not a fault.
 *
 * This does not protect the allowance from anyone else holding the key. That
 * is what Google's own quota page is for; this is only about the app not
 * spending its own allowance carelessly.
 */
const YOUTUBE_SEARCH_COST = 100;
const YOUTUBE_LOOKUP_COST = 1;
const YOUTUBE_DEFAULT_DAILY_QUOTA = 10_000;

/**
 * Kept back rather than spent to the last unit.
 *
 * A search already issued still has its lookup to pay for, and the count is
 * held in memory, so a restart forgets what today has spent. The reserve is
 * what stops either of those turning into requests that fail rather than
 * requests that were never made.
 */
const YOUTUBE_QUOTA_RESERVE = 200;

let youtubeSpend = { day: "", units: 0 };

/**
 * Today, where Google keeps it.
 *
 * The allowance resets at midnight Pacific. A counter rolling over at local
 * midnight would hand back a full allowance hours early or hours late, and
 * would move by an hour twice a year for no reason anybody could see.
 */
function pacificDay(): string {
  try {
    return new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Los_Angeles",
    });
  } catch {
    // A runtime built without the timezone data should not take the search
    // offline; a day that rolls over at the wrong hour is the lesser problem.
    return new Date().toISOString().slice(0, 10);
  }
}

function youtubeDailyQuota(): number {
  const configured = Number(process.env.YOUTUBE_DAILY_QUOTA);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : YOUTUBE_DEFAULT_DAILY_QUOTA;
}

/** What is left of today's allowance, after the reserve. */
export function youtubeQuotaRemaining(): number {
  const day = pacificDay();
  if (youtubeSpend.day !== day) youtubeSpend = { day, units: 0 };
  return Math.max(
    0,
    youtubeDailyQuota() - YOUTUBE_QUOTA_RESERVE - youtubeSpend.units,
  );
}

function recordYoutubeSpend(units: number) {
  const day = pacificDay();
  if (youtubeSpend.day !== day) youtubeSpend = { day, units: 0 };
  youtubeSpend.units += units;
}

/** Test seam: the count is process-wide and outlives a single test. */
export function resetYoutubeQuota() {
  youtubeSpend = { day: "", units: 0 };
}

/**
 * The subject most of a list of terms agrees on.
 *
 * `subjectFromTerms` takes the first thing it recognises, which is right for a
 * source that states one classification and wrong for a list of tags, where
 * every term is a separate opinion. Worse, its exact-name pass runs over the
 * whole list before its stem pass, so one tag naming a subject outright beats
 * any number of tags pointing elsewhere: a linear algebra lecture tagged
 * "linear algebra", "calculus", "physics" was filed under Physics on the
 * strength of the single tag that happened to be a subject's name.
 *
 * Counting instead lets the list say what it is mostly about. Ties go to
 * whichever was seen first, since a tag list runs from most to least relevant.
 */
export function dominantSubject(terms: string[]): string | null {
  const votes = new Map<string, number>();
  for (const term of terms) {
    const named = subjectsNamedBy(term);
    // A phrase naming two subjects has not chosen between them, so neither
    // does this. Taking the first was how the hint table's ordering — an
    // implementation detail nobody wrote down — decided what a video was about.
    if (named.length !== 1) continue;
    votes.set(named[0], (votes.get(named[0]) ?? 0) + 1);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  // A tie is the terms disagreeing, not agreeing. A titration lecture tagged
  // "physiology", "ap chemistry" and "physics" — one vote each — was filed
  // under Biology because physiology came first in the list.
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

/** How many videos one lookup may ask about. YouTube's own limit. */
export const YOUTUBE_LOOKUP_BATCH = 50;

/**
 * One request asking what a batch of videos is about.
 *
 * One for the whole batch rather than one each: a search costs a hundred units
 * of the daily allowance and this costs one, so what matters is the number of
 * requests, not how much is asked for in each.
 */
export function youtubeLookupUrl(externalIds: string[]): URL | null {
  const ids = externalIds
    .map((externalId) => externalId.replace(/^youtube:/, ""))
    .filter(Boolean);
  if (!ids.length) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", ids.slice(0, YOUTUBE_LOOKUP_BATCH).join(","));
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY ?? "");
  return url;
}

/**
 * What each video in a lookup says it is about, keyed the way the catalog
 * keys it.
 *
 * A video the answer says nothing useful about is simply absent, which callers
 * read as "leave it alone" or "Interdisciplinary" depending on whether they are
 * storing it for the first time or correcting what is already stored.
 */
export function youtubeSubjectsFrom(body: unknown): Map<string, string> {
  const items = (body as { items?: unknown[] })?.items;
  const subjects = new Map<string, string>();
  if (!Array.isArray(items)) return subjects;
  for (const entry of items) {
    const item = entry as { id?: unknown; snippet?: Record<string, unknown> };
    const id = text(item.id);
    const snippet = item.snippet ?? {};
    if (!id || !YOUTUBE_TEACHING_CATEGORIES.has(text(snippet.categoryId)))
      continue;
    const tags = Array.isArray(snippet.tags) ? snippet.tags : [];
    const subject = dominantSubject(
      tags.slice(0, YOUTUBE_TAG_LIMIT).map((tag) => text(tag)),
    );
    // The title gets a veto, and only a veto.
    //
    // A channel tags every video with the same block, so the tags can describe
    // the channel rather than the video in front of you: "History Summarized:
    // The Punic Wars" carries its channel's Shakespeare tags, and was filed
    // under Literature on the strength of them. When the video's own title
    // names a different subject, the tags are talking about something else and
    // neither is worth having.
    //
    // Never the other direction. A title that names a subject the tags do not
    // is still just a title, and reading subjects off titles is the mistake all
    // of this exists to avoid. The worst this can do is decline to classify,
    // which is where every video started.
    const titleSubject = dominantSubject([text(snippet.title)]);
    if (titleSubject && subject && titleSubject !== subject) continue;
    // Nothing the catalog knows is a perfectly good answer: a video tagged only
    // "online learning" and "video tutorial" has said nothing about its
    // subject, and Interdisciplinary is the honest place for it.
    if (subject) subjects.set(youtubeExternalId(id), subject);
  }
  return subjects;
}

/**
 * Categories where a video's stated subject is worth believing.
 *
 * 27 is Education and 28 is Science & Technology, YouTube's own labels rather
 * than the uploader's free text. Tags are written by whoever uploaded the
 * video and are a known place to stuff keywords; requiring the video to be
 * filed as teaching first means a marketing clip tagged "physics" is not
 * carried into a physics search on the strength of its own say-so.
 *
 * Being wrong in this direction is free. A video outside these categories
 * keeps the subject it has today, which is none.
 */
const YOUTUBE_TEACHING_CATEGORIES = new Set(["27", "28"]);

/**
 * How far into a tag list to read.
 *
 * The first handful are what a video is about; a long tail is search-engine
 * padding, and reading all of it is how an unrelated word ends up deciding
 * the subject.
 */
const YOUTUBE_TAG_LIMIT = 12;

const youtube: OpenSource = {
  kind: "youtube",
  provider: "YouTube",
  providerUrl: "https://www.youtube.com/",
  host: "www.googleapis.com",
  material: "video",
  pageSize: 25,
  // Not asked at all once the day's allowance is down to its last search, so
  // the refusal is a source that is quietly unavailable rather than a request
  // that comes back 403 and rests the provider for a minute.
  available: () =>
    Boolean(process.env.YOUTUBE_API_KEY) &&
    youtubeQuotaRemaining() >= YOUTUBE_SEARCH_COST,
  onRequest: (kind) =>
    recordYoutubeSpend(
      kind === "search" ? YOUTUBE_SEARCH_COST : YOUTUBE_LOOKUP_COST,
    ),
  endpoint(query, _offset, pageSize) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "video");
    // Only videos their owner has allowed to be embedded and reused, and only
    // ones long enough to teach something.
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("videoDuration", "medium");
    url.searchParams.set("relevanceLanguage", "en");
    url.searchParams.set("safeSearch", "strict");
    url.searchParams.set("maxResults", String(Math.min(50, pageSize)));
    url.searchParams.set("key", process.env.YOUTUBE_API_KEY ?? "");
    return url;
  },
  parse(body) {
    const items = (body as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) return [];
    const rows: ParsedResource[] = [];
    for (const entry of items) {
      const item = entry as {
        id?: { videoId?: unknown };
        snippet?: Record<string, unknown>;
      };
      const videoId = text(item.id?.videoId);
      const snippet = item.snippet ?? {};
      const title = text(snippet.title);
      if (!videoId || !isUsableTitle(title)) continue;
      const thumbnails = (snippet.thumbnails ?? {}) as Record<
        string,
        { url?: unknown }
      >;
      rows.push({
        externalId: youtubeExternalId(videoId),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        description: clamp(
          text(snippet.description) ||
            `A video from ${text(snippet.channelTitle) || "YouTube"}.`,
        ),
        author: text(snippet.channelTitle) || null,
        // A search response carries no classification, and guessing one from a
        // title is how the catalog poisoned itself before. `enrich` asks for
        // YouTube's own, in a second request; until it answers this stays null.
        subject: null,
        language: "en",
        license: "Standard YouTube licence unless the video says otherwise",
        publishedAt: text(snippet.publishedAt) || null,
        thumbnailUrl:
          text(thumbnails.high?.url) || text(thumbnails.medium?.url) || null,
        format: "video",
      });
    }
    return rows;
  },
  /**
   * What the video says it is about.
   *
   * A search response carries no classification at all, which is why every
   * video in the catalog is filed as Interdisciplinary. `videos.list` carries
   * the uploader's own tags, and those are the same kind of thing this catalog
   * already trusts everywhere else: the keywords on a DOAJ article, the
   * bookshelves on a Gutenberg text, the concepts on an OpenAlex work. The
   * line that matters is that a tag is a statement *about* the video, not a
   * word read off its title — reading subjects off titles is what once filed
   * everything under the searcher's own query.
   *
   * YouTube's `topicCategories` looked like the better answer and is not:
   * asked about Crash Course Biology, Math Antics and Khan Academy
   * stoichiometry, it returned "Knowledge" for all three. Its taxonomy
   * separates music from sport, not biology from chemistry.
   */
  enrich: {
    endpoint: (rows) => youtubeLookupUrl(rows.map((row) => row.externalId)),
    apply(rows, body) {
      const subjects = youtubeSubjectsFrom(body);
      if (!subjects.size) return rows;
      return rows.map((row) => {
        const subject = subjects.get(row.externalId);
        return subject ? { ...row, subject } : row;
      });
    },
  },
};

export const OPEN_SOURCES: OpenSource[] = [
  doab,
  doaj,
  europePmc,
  arxiv,
  openalex,
  gutenberg,
  internetArchive,
  youtube,
];


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
