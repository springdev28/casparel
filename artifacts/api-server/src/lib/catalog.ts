import { and, asc, desc, eq, ilike, not, or, sql, type SQL } from "drizzle-orm";
import {
  catalogResourcesTable,
  catalogSyncStateTable,
  db,
  type InsertCatalogResource,
} from "@workspace/db";
import { meaningfulSearchTerms } from "./searchTerms";

type ResourceFormat = InsertCatalogResource["format"];
export type CatalogSearchOptions = {
  query: string;
  format?: ResourceFormat;
  subject?: string;
  gradeLevel?: string;
  language?: string;
  page?: number;
  limit?: number;
  resultType?: "content" | "source" | "people";
  exactPhrase?: string;
  excludedWords?: string;
  source?: string;
  freshness?: string;
  accessType?: string;
  license?: string;
};

export type CatalogSearchItem = {
  title: string;
  url: string;
  description: string;
  format: ResourceFormat;
  source: string;
  thumbnailUrl: string | null;
  subject: string | null;
  gradeLevel: string | null;
};

export function canonicalCatalogUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["fbclid", "gclid", "si"].includes(key))
      url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

type CuratedResource = Omit<
  InsertCatalogResource,
  "canonicalUrl" | "externalId" | "lastSyncedAt"
> & {
  url: string;
  externalId?: string;
};

const curated = (
  provider: string,
  providerUrl: string,
  title: string,
  url: string,
  description: string,
  format: ResourceFormat,
  subject: string,
  gradeLevel: string,
  license: string,
  author = provider,
): CuratedResource => ({
  provider,
  providerUrl,
  title,
  url,
  description,
  format,
  subject,
  gradeLevel,
  language: "en",
  license,
  author,
  sourceKind: "curated",
  metadata: { accessType: "free" },
});

const CURATED_RESOURCES: CuratedResource[] = [
  curated(
    "MIT OpenCourseWare",
    "https://ocw.mit.edu/",
    "Introduction to Computer Science and Programming in Python",
    "https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/",
    "MIT lectures, assignments, and problem sets introducing programming and computational problem solving with Python.",
    "video",
    "Computer Science",
    "Higher education",
    "CC BY-NC-SA 4.0",
  ),
  curated(
    "MIT OpenCourseWare",
    "https://ocw.mit.edu/",
    "Linear Algebra",
    "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
    "A complete undergraduate linear algebra course with video lectures, assignments, and exams.",
    "video",
    "Mathematics",
    "Higher education",
    "CC BY-NC-SA 4.0",
    "Prof. Gilbert Strang",
  ),
  curated(
    "OpenStax",
    "https://openstax.org/subjects",
    "Biology 2e",
    "https://openstax.org/details/books/biology-2e",
    "A comprehensive peer-reviewed open biology textbook with illustrations, review questions, and supporting resources.",
    "pdf",
    "Biology",
    "Higher education",
    "CC BY 4.0",
  ),
  curated(
    "OpenStax",
    "https://openstax.org/subjects",
    "Algebra and Trigonometry 2e",
    "https://openstax.org/details/books/algebra-and-trigonometry-2e",
    "A peer-reviewed open textbook with worked examples and exercises in algebra and trigonometry.",
    "pdf",
    "Mathematics",
    "Higher education",
    "CC BY 4.0",
  ),
  curated(
    "PhET Interactive Simulations",
    "https://phet.colorado.edu/",
    "Projectile Motion",
    "https://phet.colorado.edu/en/simulations/projectile-motion",
    "An interactive simulation for exploring trajectories, vectors, air resistance, and projectile motion.",
    "interactive",
    "Physics",
    "Secondary and higher education",
    "CC BY 4.0",
    "University of Colorado Boulder",
  ),
  curated(
    "Khan Academy",
    "https://www.khanacademy.org/",
    "Algebra 1",
    "https://www.khanacademy.org/math/algebra",
    "Video lessons, worked examples, and mastery practice across a full Algebra 1 curriculum.",
    "interactive",
    "Mathematics",
    "Secondary education",
    "Free to access; provider terms apply",
  ),
  curated(
    "NASA",
    "https://www.nasa.gov/learning-resources/",
    "NASA Learning Resources",
    "https://www.nasa.gov/learning-resources/",
    "Standards-aligned activities, articles, challenges, and multimedia about Earth and space science.",
    "interactive",
    "Earth and Space Science",
    "All levels",
    "U.S. government content; item rights may vary",
  ),
  curated(
    "Library of Congress",
    "https://www.loc.gov/programs/teachers/",
    "Classroom Materials",
    "https://www.loc.gov/programs/teachers/classroom-materials/",
    "Primary-source sets, lesson plans, and presentations for history, civics, literature, and the arts.",
    "article",
    "History",
    "Primary and secondary education",
    "Rights vary by collection item",
  ),
  curated(
    "Purdue OWL",
    "https://owl.purdue.edu/",
    "Research and Citation Resources",
    "https://owl.purdue.edu/owl/research_and_citation/resources.html",
    "Writing guidance for research, source evaluation, citation styles, and avoiding plagiarism.",
    "article",
    "Writing",
    "Secondary and higher education",
    "Free to access; provider terms apply",
  ),
  curated(
    "MDN Web Docs",
    "https://developer.mozilla.org/",
    "Learn Web Development",
    "https://developer.mozilla.org/en-US/docs/Learn_web_development",
    "A structured learning path for HTML, CSS, JavaScript, accessibility, and modern web development.",
    "article",
    "Computer Science",
    "Secondary and higher education",
    "CC BY-SA 2.5 or later",
    "MDN contributors",
  ),
  curated(
    "Stanford Encyclopedia of Philosophy",
    "https://plato.stanford.edu/",
    "Stanford Encyclopedia of Philosophy",
    "https://plato.stanford.edu/",
    "Expert-authored and editorially reviewed reference articles covering major topics and figures in philosophy.",
    "article",
    "Philosophy",
    "Higher education",
    "Free to access; copyright held by Stanford University and authors",
    "Stanford University",
  ),
  curated(
    "Smithsonian Learning Lab",
    "https://learninglab.si.edu/",
    "Smithsonian Learning Lab",
    "https://learninglab.si.edu/",
    "Searchable museum resources and educator-created collections spanning science, history, culture, and art.",
    "interactive",
    "Interdisciplinary",
    "All levels",
    "Rights vary by collection item",
    "Smithsonian Institution",
  ),
  curated(
    "BBC Bitesize",
    "https://www.bbc.co.uk/bitesize",
    "BBC Bitesize",
    "https://www.bbc.co.uk/bitesize",
    "Curriculum-linked lessons, revision guides, videos, and quizzes for primary and secondary subjects.",
    "interactive",
    "Interdisciplinary",
    "Primary and secondary education",
    "Free to access; provider terms apply",
  ),
  curated(
    "Open Yale Courses",
    "https://oyc.yale.edu/",
    "Open Yale Courses",
    "https://oyc.yale.edu/courses",
    "Free lecture courses spanning humanities, social sciences, and physical and biological sciences.",
    "video",
    "Interdisciplinary",
    "Higher education",
    "CC BY-NC-SA 3.0 unless otherwise noted",
    "Yale University",
  ),
  curated(
    "GeoGebra",
    "https://www.geogebra.org/",
    "GeoGebra Math Apps",
    "https://www.geogebra.org/maths-apps",
    "Interactive graphing, geometry, 3D, probability, and algebra tools for mathematical exploration.",
    "interactive",
    "Mathematics",
    "All levels",
    "Free to access; provider terms apply",
  ),
  curated(
    "LibreTexts",
    "https://libretexts.org/",
    "LibreTexts Open Education Libraries",
    "https://libretexts.org/",
    "Open textbooks and learning materials across STEM, humanities, and social sciences.",
    "article",
    "Interdisciplinary",
    "Secondary and higher education",
    "Open licenses vary by resource",
  ),
  curated(
    "OpenStax",
    "https://openstax.org/subjects",
    "Calculus Volume 1",
    "https://openstax.org/details/books/calculus-volume-1",
    "A peer-reviewed open textbook covering functions, limits, derivatives, and integration with examples and exercises.",
    "pdf",
    "Calculus",
    "Higher education",
    "CC BY 4.0",
  ),
  curated(
    "University of Helsinki",
    "https://fullstackopen.com/en/",
    "Full Stack Open",
    "https://fullstackopen.com/en/",
    "A project-based course in modern JavaScript web development with React, Node.js, APIs, testing, TypeScript, and GraphQL.",
    "interactive",
    "Full-Stack Web Development",
    "Higher education",
    "CC BY-NC-SA 3.0",
    "University of Helsinki",
  ),
  curated(
    "Harvard CS50",
    "https://cs50.harvard.edu/web/",
    "CS50's Web Programming with Python and JavaScript",
    "https://cs50.harvard.edu/web/",
    "An open course covering Python, Django, SQL, JavaScript, user interfaces, testing, scalability, and web security.",
    "video",
    "Full-Stack Web Development",
    "Higher education",
    "CC BY-NC-SA 4.0",
    "Brian Yu and David J. Malan",
  ),
  curated(
    "React",
    "https://react.dev/",
    "Learn React",
    "https://react.dev/learn",
    "The official interactive learning path for components, state, events, data flow, and modern React application patterns.",
    "interactive",
    "Frontend Web Development",
    "Secondary and higher education",
    "CC BY 4.0 for documentation; code samples MIT",
    "React contributors",
  ),
  curated(
    "TypeScript",
    "https://www.typescriptlang.org/",
    "The TypeScript Handbook",
    "https://www.typescriptlang.org/docs/handbook/intro.html",
    "The official guide to TypeScript syntax, type-system behavior, common patterns, and compiler concepts.",
    "article",
    "Full-Stack Web Development",
    "Secondary and higher education",
    "CC BY 4.0 for documentation",
    "Microsoft and TypeScript contributors",
  ),
];

function prepared(resource: CuratedResource): InsertCatalogResource {
  const { url, ...values } = resource;
  const canonicalUrl = canonicalCatalogUrl(url);
  return {
    ...values,
    canonicalUrl,
    externalId: resource.externalId ?? canonicalUrl,
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function upsertCatalogResources(items: InsertCatalogResource[]) {
  if (!items.length) return 0;
  const now = new Date().toISOString();
  for (let offset = 0; offset < items.length; offset += 50) {
    await db
      .insert(catalogResourcesTable)
      .values(items.slice(offset, offset + 50))
      .onConflictDoUpdate({
        target: catalogResourcesTable.canonicalUrl,
        set: {
          provider: sql`excluded.provider`,
          providerUrl: sql`excluded.provider_url`,
          externalId: sql`excluded.external_id`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          format: sql`excluded.format`,
          subject: sql`excluded.subject`,
          gradeLevel: sql`excluded.grade_level`,
          language: sql`excluded.language`,
          license: sql`excluded.license`,
          author: sql`excluded.author`,
          thumbnailUrl: sql`excluded.thumbnail_url`,
          publishedAt: sql`excluded.published_at`,
          sourceKind: sql`excluded.source_kind`,
          metadata: sql`excluded.metadata`,
          lastSyncedAt: now,
        },
      });
  }
  return items.length;
}

export async function ensureCuratedCatalog() {
  return upsertCatalogResources(CURATED_RESOURCES.map(prepared));
}

const filterTokens = (value: string) =>
  value.trim().split(/\s+/).filter(Boolean).slice(0, 8);

export async function searchCatalog(
  options: CatalogSearchOptions,
): Promise<CatalogSearchItem[]> {
  if (options.resultType === "people") return [];
  const conditions: SQL[] = [];
  const searchTerms = meaningfulSearchTerms(options.query);
  if (searchTerms.length)
    conditions.push(
      or(
        ...searchTerms.map((token) => {
          const pattern = `%${token}%`;
          return or(
            ilike(catalogResourcesTable.title, pattern),
            ilike(catalogResourcesTable.description, pattern),
            ilike(catalogResourcesTable.subject, pattern),
            ilike(catalogResourcesTable.provider, pattern),
            ilike(catalogResourcesTable.author, pattern),
          )!;
        }),
      )!,
    );
  if (options.format)
    conditions.push(eq(catalogResourcesTable.format, options.format));
  if (options.subject)
    conditions.push(
      ilike(catalogResourcesTable.subject, `%${options.subject}%`),
    );
  if (options.gradeLevel)
    conditions.push(
      or(
        ilike(catalogResourcesTable.gradeLevel, `%${options.gradeLevel}%`),
        ilike(catalogResourcesTable.gradeLevel, "%All levels%"),
      )!,
    );
  if (options.language && options.language !== "any")
    conditions.push(eq(catalogResourcesTable.language, options.language));
  if (options.source)
    conditions.push(
      ilike(catalogResourcesTable.provider, `%${options.source}%`),
    );
  if (options.exactPhrase)
    conditions.push(
      or(
        ilike(catalogResourcesTable.title, `%${options.exactPhrase}%`),
        ilike(catalogResourcesTable.description, `%${options.exactPhrase}%`),
      )!,
    );
  for (const word of filterTokens(options.excludedWords ?? "")) {
    const pattern = `%${word}%`;
    conditions.push(
      not(
        or(
          ilike(catalogResourcesTable.title, pattern),
          ilike(catalogResourcesTable.description, pattern),
          ilike(catalogResourcesTable.subject, pattern),
        )!,
      ),
    );
  }
  if (["free", "open"].includes(options.accessType ?? ""))
    conditions.push(
      sql`coalesce(${catalogResourcesTable.metadata}->>'accessType', '') = 'free'`,
    );
  if (options.license === "known")
    conditions.push(sql`${catalogResourcesTable.license} is not null`);
  if (options.license === "reusable")
    conditions.push(
      or(
        ilike(catalogResourcesTable.license, "%CC %"),
        ilike(catalogResourcesTable.license, "%Creative Commons%"),
        ilike(catalogResourcesTable.license, "%public domain%"),
      )!,
    );
  if (options.freshness === "year")
    conditions.push(
      sql`coalesce(${catalogResourcesTable.publishedAt}, ${catalogResourcesTable.lastSyncedAt}) >= now() - interval '1 year'`,
    );
  if (options.freshness === "three_years")
    conditions.push(
      sql`coalesce(${catalogResourcesTable.publishedAt}, ${catalogResourcesTable.lastSyncedAt}) >= now() - interval '3 years'`,
    );

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(24, Math.max(1, options.limit ?? 16));
  const query = options.query.trim();
  const relevance = query
    ? sql<number>`case when lower(${catalogResourcesTable.title}) = lower(${query}) then 0 when ${catalogResourcesTable.title} ilike ${`%${query}%`} then 1 when ${catalogResourcesTable.subject} ilike ${`%${query}%`} then 2 else 3 end`
    : sql<number>`3`;
  const rows = await db
    .select()
    .from(catalogResourcesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(relevance), desc(catalogResourcesTable.lastSyncedAt))
    .limit(options.resultType === "source" ? limit * 4 : limit)
    .offset((page - 1) * limit);

  if (options.resultType === "source") {
    const seen = new Set<string>();
    return rows
      .filter(
        (row) => !seen.has(row.provider) && Boolean(seen.add(row.provider)),
      )
      .slice(0, limit)
      .map((row) => ({
        title: row.provider,
        url: row.providerUrl,
        description: `Open educational resources from ${row.provider}.`,
        format: "other",
        source: row.provider,
        thumbnailUrl: null,
        subject: row.subject,
        gradeLevel: row.gradeLevel,
      }));
  }
  return rows.map((row) => ({
    title: row.title,
    url: row.canonicalUrl,
    description:
      row.description ?? `Educational resource from ${row.provider}.`,
    format: row.format,
    source: row.provider,
    thumbnailUrl: row.thumbnailUrl,
    subject: row.subject,
    gradeLevel: row.gradeLevel,
  }));
}

type OpenLibraryDocument = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  language?: string[];
  ebook_access?: string;
  public_scan_b?: boolean;
};
let nextOpenLibraryRequestAt = 0;
let openLibraryQueue: Promise<void> = Promise.resolve();
const openLibraryInFlight = new Map<string, Promise<number>>();
const wikibooksInFlight = new Map<string, Promise<number>>();
let nextWikibooksRequestAt = 0;
let wikibooksQueue: Promise<void> = Promise.resolve();

function catalogItemLimit() {
  const configured = Number(process.env.CATALOG_MAX_ITEMS);
  return Number.isInteger(configured) && configured >= 1000
    ? Math.min(configured, 250_000)
    : 50_000;
}

async function currentCatalogSize() {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogResourcesTable);
  return Number(result?.count ?? 0);
}

async function waitForOpenLibrarySlot() {
  let release = () => {};
  const previous = openLibraryQueue;
  openLibraryQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const waitMs = Math.max(0, nextOpenLibraryRequestAt - Date.now());
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  nextOpenLibraryRequestAt = Date.now() + 1100;
  release();
}

async function waitForWikibooksSlot() {
  let release = () => {};
  const previous = wikibooksQueue;
  wikibooksQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const waitMs = Math.max(0, nextWikibooksRequestAt - Date.now());
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  nextWikibooksRequestAt = Date.now() + 1100;
  release();
}

function catalogUserAgent() {
  return process.env.CATALOG_CONTACT_EMAIL
    ? `Schoolar/1.0 (${process.env.CATALOG_CONTACT_EMAIL})`
    : "Schoolar/1.0 (https://github.com/springdev28/schoolar)";
}

export async function searchOpenLibraryAndStore(options: CatalogSearchOptions) {
  if (process.env.CATALOG_REMOTE_SEARCH_ENABLED === "false") return 0;
  const query = [meaningfulSearchTerms(options.query).join(" "), options.subject]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (query.length < 2) return 0;
  const key = `${query.toLowerCase()}:${options.language ?? "en"}`;
  const existing = openLibraryInFlight.get(key);
  if (existing) return existing;
  const task = (async () => {
    const attemptedAt = new Date().toISOString();
    try {
      const currentSize = await currentCatalogSize();
      const remainingCapacity = Math.max(0, catalogItemLimit() - currentSize);
      if (!remainingCapacity) return 0;
      await waitForOpenLibrarySlot();
      const endpoint = new URL("https://openlibrary.org/search.json");
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set(
        "fields",
        "key,title,author_name,first_publish_year,cover_i,subject,language,ebook_access,public_scan_b",
      );
      endpoint.searchParams.set("limit", "20");
      if (options.language && options.language !== "any")
        endpoint.searchParams.set("lang", options.language);
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(7000),
        headers: {
          Accept: "application/json",
          "User-Agent": catalogUserAgent(),
        },
      });
      if (!response.ok)
        throw new Error(`Open Library returned ${response.status}`);
      const payload = (await response.json()) as {
        docs?: OpenLibraryDocument[];
      };
      const now = new Date().toISOString();
      const items = (payload.docs ?? [])
        .filter(
          (doc) =>
            doc.key &&
            doc.title &&
            (doc.public_scan_b || doc.ebook_access === "public"),
        )
        .slice(0, Math.min(12, remainingCapacity))
        .map((doc): InsertCatalogResource => {
          const authors = doc.author_name?.slice(0, 3).join(", ") || null;
          const year = doc.first_publish_year
            ? String(doc.first_publish_year)
            : null;
          const details = [authors, year].filter(Boolean).join(" · ");
          return {
            provider: "Open Library",
            providerUrl: "https://openlibrary.org/",
            externalId: doc.key!,
            canonicalUrl: canonicalCatalogUrl(
              `https://openlibrary.org${doc.key}`,
            ),
            title: doc.title!,
            description: details
              ? `${details}. Publicly readable book metadata from Open Library.`
              : "Publicly readable book metadata from Open Library.",
            format: "other",
            subject: (
              options.subject ||
              doc.subject?.[0] ||
              "Interdisciplinary"
            ).slice(0, 160),
            gradeLevel: options.gradeLevel || "All levels",
            language:
              options.language && options.language !== "any"
                ? options.language
                : (doc.language?.[0] ?? "en"),
            license: "Linked work rights vary; Open Library metadata only",
            author: authors,
            thumbnailUrl: doc.cover_i
              ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
              : null,
            publishedAt: year ? `${year}-01-01T00:00:00.000Z` : null,
            sourceKind: "open-library",
            metadata: {
              accessType: "free",
              openLibraryKey: doc.key,
              subjects: doc.subject?.slice(0, 20) ?? [],
            },
            lastSyncedAt: now,
          };
        });
      const count = await upsertCatalogResources(items);
      await db
        .insert(catalogSyncStateTable)
        .values({
          provider: "Open Library",
          lastAttemptedAt: attemptedAt,
          lastSuccessfulAt: now,
          itemCount: count,
          error: null,
        })
        .onConflictDoUpdate({
          target: catalogSyncStateTable.provider,
          set: {
            lastAttemptedAt: attemptedAt,
            lastSuccessfulAt: now,
            itemCount: count,
            error: null,
          },
        });
      return count;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .insert(catalogSyncStateTable)
        .values({
          provider: "Open Library",
          lastAttemptedAt: attemptedAt,
          itemCount: 0,
          error: message,
        })
        .onConflictDoUpdate({
          target: catalogSyncStateTable.provider,
          set: { lastAttemptedAt: attemptedAt, error: message },
        });
      return 0;
    } finally {
      openLibraryInFlight.delete(key);
    }
  })();
  openLibraryInFlight.set(key, task);
  return task;
}

type WikibooksPage = {
  pageid?: number;
  title?: string;
  extract?: string;
  fullurl?: string;
};

export async function searchWikibooksAndStore(options: CatalogSearchOptions) {
  if (process.env.CATALOG_REMOTE_SEARCH_ENABLED === "false") return 0;
  const query = [meaningfulSearchTerms(options.query).join(" "), options.subject]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (query.length < 2) return 0;

  const supportedLanguages = new Set(["de", "en", "es", "fr", "pt", "tr"]);
  const requestedLanguage = options.language?.toLowerCase() ?? "en";
  const language = supportedLanguages.has(requestedLanguage)
    ? requestedLanguage
    : "en";
  const key = `${language}:${query.toLowerCase()}`;
  const existing = wikibooksInFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const attemptedAt = new Date().toISOString();
    const syncProvider = `Wikibooks (${language})`;
    try {
      const currentSize = await currentCatalogSize();
      const remainingCapacity = Math.max(0, catalogItemLimit() - currentSize);
      if (!remainingCapacity) return 0;

      await waitForWikibooksSlot();
      const endpoint = new URL(
        `https://${language}.wikibooks.org/w/api.php`,
      );
      const params = {
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "0",
        gsrlimit: "8",
        prop: "extracts|info",
        exintro: "1",
        explaintext: "1",
        exsentences: "2",
        inprop: "url",
        format: "json",
        formatversion: "2",
        maxlag: "2",
      };
      for (const [name, value] of Object.entries(params))
        endpoint.searchParams.set(name, value);

      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(7000),
        headers: {
          Accept: "application/json",
          "User-Agent": catalogUserAgent(),
        },
      });
      if (!response.ok)
        throw new Error(`Wikibooks returned ${response.status}`);
      const payload = (await response.json()) as {
        error?: { info?: string };
        query?: { pages?: WikibooksPage[] };
      };
      if (payload.error)
        throw new Error(payload.error.info ?? "Wikibooks API error");

      const now = new Date().toISOString();
      const items = (payload.query?.pages ?? [])
        .filter(
          (page): page is Required<
            Pick<WikibooksPage, "pageid" | "title" | "fullurl">
          > &
            WikibooksPage =>
            Number.isInteger(page.pageid) &&
            Boolean(page.title) &&
            Boolean(page.fullurl),
        )
        .slice(0, Math.min(8, remainingCapacity))
        .map((page): InsertCatalogResource => ({
          provider: "Wikibooks",
          providerUrl: `https://${language}.wikibooks.org/`,
          externalId: `${language}:${page.pageid}`,
          canonicalUrl: canonicalCatalogUrl(page.fullurl),
          title: page.title,
          description:
            page.extract?.replace(/\s+/g, " ").trim().slice(0, 600) ||
            `An open educational book from ${language}.wikibooks.org.`,
          format: "article",
          subject: (
            options.subject ||
            meaningfulSearchTerms(options.query)[0] ||
            "Interdisciplinary"
          ).slice(0, 160),
          gradeLevel: options.gradeLevel || "All levels",
          language,
          license: "CC BY-SA and GFDL; see page history for attribution",
          author: "Wikibooks contributors",
          thumbnailUrl: null,
          publishedAt: null,
          sourceKind: "wikibooks",
          metadata: {
            accessType: "free",
            pageId: page.pageid,
          },
          lastSyncedAt: now,
        }));
      const count = await upsertCatalogResources(items);
      await db
        .insert(catalogSyncStateTable)
        .values({
          provider: syncProvider,
          lastAttemptedAt: attemptedAt,
          lastSuccessfulAt: now,
          itemCount: count,
          error: null,
        })
        .onConflictDoUpdate({
          target: catalogSyncStateTable.provider,
          set: {
            lastAttemptedAt: attemptedAt,
            lastSuccessfulAt: now,
            itemCount: count,
            error: null,
          },
        });
      return count;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .insert(catalogSyncStateTable)
        .values({
          provider: syncProvider,
          lastAttemptedAt: attemptedAt,
          itemCount: 0,
          error: message,
        })
        .onConflictDoUpdate({
          target: catalogSyncStateTable.provider,
          set: { lastAttemptedAt: attemptedAt, error: message },
        });
      return 0;
    } finally {
      wikibooksInFlight.delete(key);
    }
  })();
  wikibooksInFlight.set(key, task);
  return task;
}
