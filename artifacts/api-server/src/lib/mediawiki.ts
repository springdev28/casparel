/**
 * Importing open educational works from MediaWiki sites.
 *
 * Wikibooks, Wikiversity and Wikipedia all speak the same API, so they share
 * one importer rather than one copy each. The shape of a good import is the
 * same everywhere: find candidate pages, resolve them to the *work* a reader
 * would want (a whole book, not chapter 7's print version), then ask the wiki
 * what that work is actually about.
 *
 * That second step is the point. The old importer stored whatever the search
 * generator returned, described every result as "A complete open educational
 * book from en.wikibooks.org", and — worse — filed each one under the
 * searcher's own query. A catalogue that records the question instead of the
 * answer poisons itself: every book imported while someone searched "AP
 * Physics C" was subject "AP", so it came back for every later AP search, and
 * "AP Physics C: Electricity and Mechanics" answered with wireless telegraphy
 * in Australia.
 */

import { meaningfulSearchTerms } from "./searchTerms";
import type { MaterialKind } from "./openSources";

export type MediaWikiSite = {
  /** Provider name as stored, without the language suffix. */
  provider: string;
  /** Host template; `{lang}` is replaced with the language code. */
  host: string;
  /** Languages this importer will query. Others fall back to English. */
  languages: Set<string>;
  /** Stored format for works from this site. */
  format: "article" | "video" | "pdf" | "podcast" | "interactive" | "other";
  license: string;
  /**
   * Whether a subpage should be rolled up to its parent. Wikibooks and
   * Wikiversity nest chapters under the work; Wikipedia articles stand alone
   * and their slashes are part of the title.
   */
  rollUpSubpages: boolean;
  sourceKind: "wikibooks" | "wikiversity" | "wikipedia" | "wikisource";
  /**
   * What a reader is getting. A search for a school topic wants a textbook and
   * an encyclopedia article for different reasons, and now that the catalog also
   * holds peer-reviewed papers a reader has to be able to say which.
   */
  material: MaterialKind;
};

export const MEDIAWIKI_SITES: MediaWikiSite[] = [
  {
    provider: "Wikibooks",
    host: "{lang}.wikibooks.org",
    languages: new Set(["de", "en", "es", "fr", "pt", "tr"]),
    format: "article",
    license: "CC BY-SA and GFDL; see page history for attribution",
    rollUpSubpages: true,
    sourceKind: "wikibooks",
    material: "book",
  },
  {
    provider: "Wikiversity",
    host: "{lang}.wikiversity.org",
    languages: new Set(["de", "en", "es", "fr", "pt"]),
    format: "article",
    license: "CC BY-SA; see page history for attribution",
    rollUpSubpages: true,
    sourceKind: "wikiversity",
    material: "course",
  },
  {
    provider: "Wikipedia",
    host: "{lang}.wikipedia.org",
    languages: new Set(["de", "en", "es", "fr", "pt", "tr"]),
    format: "article",
    license: "CC BY-SA; see page history for attribution",
    rollUpSubpages: false,
    sourceKind: "wikipedia",
    material: "reference",
  },
  // Primary sources: the speeches, treaties, papers and literature a history or
  // literature question wants to read rather than read *about*. Subpages are
  // chapters of a work, as on Wikibooks.
  {
    provider: "Wikisource",
    host: "{lang}.wikisource.org",
    languages: new Set(["de", "en", "es", "fr", "pt"]),
    format: "article",
    license: "CC BY-SA and public domain; see the page for the work's status",
    rollUpSubpages: true,
    sourceKind: "wikisource",
    material: "primary",
  },
];

/**
 * Pseudo-namespaces that live in the main namespace but are not works.
 *
 * Wikibooks keeps its shelves and departments as ordinary titles, so a search
 * happily returns "Shelf:Physics" — an index page, not something to study.
 */
const NON_WORK_PREFIXES = [
  "shelf:",
  "subject:",
  "department:",
  "wikibooks:",
  "wikiversity:",
  "wikipedia:",
  "help:",
  "template:",
  "category:",
  "portal:",
  "draft:",
  "user:",
  "talk:",
  "file:",
  "module:",
  "mediawiki:",
];

/** Chapter titles that describe packaging rather than content. */
const NON_WORK_SUFFIXES = [
  "/print version",
  "/printable version",
  "/all chapters",
  "/table of contents",
];

export function isWorkTitle(title: string): boolean {
  const lower = title.toLowerCase();
  if (NON_WORK_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  // Disambiguation and list pages are navigation, not material.
  if (lower.startsWith("list of ") || lower.endsWith("(disambiguation)"))
    return false;
  return true;
}

/**
 * The work a page belongs to.
 *
 * "FHSST Physics/Print version" and "FHSST Physics/Electrostatics/Charge" are
 * both the FHSST Physics book. Rolling them up is what stops a search filling
 * a page with chapters of one title.
 */
export function workTitle(title: string, rollUpSubpages: boolean): string {
  if (!rollUpSubpages) return title.trim();
  const lower = title.toLowerCase();
  for (const suffix of NON_WORK_SUFFIXES)
    if (lower.endsWith(suffix)) return title.slice(0, -suffix.length).trim();
  const root = title.split("/")[0]?.trim();
  return root || title.trim();
}

/**
 * Subjects the catalogue already speaks, so an imported work files next to the
 * curated ones instead of inventing a parallel vocabulary.
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

/** Shelf and category names that describe a programme or series, not a field. */
const NON_SUBJECT_SHELVES = [
  "advanced placement",
  "featured books",
  "free high school science texts",
  "wikibooks",
  "wikijunior",
  "books nominated for deletion",
  "completed books",
  "partly developed books",
];

function normaliseShelf(name: string): string {
  let value = name;
  // Categories arrive fully prefixed and can nest, e.g. "Category:Book:Mirad
  // Grammar". Strip until nothing is left to strip.
  for (;;) {
    const stripped = value.replace(
      /^\s*(shelf|category|subject|department|book|portal|wikiversity|wikibooks):/i,
      "",
    );
    if (stripped === value) break;
    value = stripped;
  }
  return value
    .replace(/\s*\((?:books?|bookshelf|subject)\)\s*$/i, "")
    .replace(/\s+(?:study guides?|textbooks?|books?|courses?|resources?)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The subject a wiki says a work belongs to.
 *
 * Derived only from the work's own categories, and only when one of them names
 * a subject the catalogue already knows. Anything else is discarded rather
 * than stored: a wiki's categories are written for editors, not readers, so
 * taking the first one available files the Advanced Placement article under
 * "1955 establishments in the United States" and a Florida high school under
 * "2021 establishments in Florida". A wrong subject is worse than none — it is
 * what a later search matches on.
 *
 * Never the query or the searcher's filters. Those describe the person
 * searching, not the work, and writing them down is what made the catalogue
 * answer "AP Physics C" with wireless telegraphy in Australia.
 */
export function subjectFromCategories(categories: string[]): string | null {
  const shelves = categories
    .map(normaliseShelf)
    .filter(Boolean)
    .filter((name) => !NON_SUBJECT_SHELVES.includes(name.toLowerCase()));

  const exact = shelves.find((shelf) =>
    KNOWN_SUBJECTS.some(
      (subject) => subject.toLowerCase() === shelf.toLowerCase(),
    ),
  );
  if (exact)
    return KNOWN_SUBJECTS.find(
      (subject) => subject.toLowerCase() === exact.toLowerCase(),
    )!;

  // A shelf that contains a known subject as a whole word still counts:
  // "Physics study guides" survives normalising to "Physics study", and
  // "Introduction to Chemistry" is a chemistry shelf.
  for (const shelf of shelves) {
    const named = KNOWN_SUBJECTS.find((subject) =>
      new RegExp(`\\b${subject}\\b`, "i").test(shelf),
    );
    if (named) return named;
  }

  return null;
}

/** The search string sent to a wiki, built from the query's meaningful words. */
export function wikiSearchQuery(query: string, subject?: string): string {
  return [meaningfulSearchTerms(query).join(" "), subject]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function siteHost(site: MediaWikiSite, language: string): string {
  return site.host.replace("{lang}", language);
}

export function siteLanguage(site: MediaWikiSite, requested?: string): string {
  const language = requested?.toLowerCase() ?? "en";
  return site.languages.has(language) ? language : "en";
}
