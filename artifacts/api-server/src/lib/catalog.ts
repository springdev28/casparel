import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  catalogResourcesTable,
  catalogSyncStateTable,
  db,
  type InsertCatalogResource,
} from "@workspace/db";
import {
  SUBSTANTIVE_TERM_LENGTH,
  filterValues,
  meaningfulSearchTerms,
  topicalSearchTerms,
  wordStartPattern,
} from "./searchTerms";
import {
  OPEN_SOURCES,
  openSourceIsExcluded,
  queryWantsResearch,
  YOUTUBE_LOOKUP_BATCH,
  youtubeLookupUrl,
  youtubeSubjectsFrom,
  type OpenSource,
  type ParsedResource,
} from "./openSources";
import {
  MEDIAWIKI_SITES,
  isWorkTitle,
  siteHost,
  siteLanguage,
  subjectFromCategories,
  wikiSearchQuery,
  workTitle,
  type MediaWikiSite,
} from "./mediawiki";

// NonNullable because the column has a database default, so the *insert* type
// makes it optional — which quietly put `undefined` in every list of formats.
type ResourceFormat = NonNullable<InsertCatalogResource["format"]>;
/** Every format a stored row can have, so a filter value can be checked. */
const CATALOG_FORMATS: ResourceFormat[] = [
  "article",
  "video",
  "pdf",
  "podcast",
  "interactive",
  "other",
];
export type SourceCredibility =
  "academic" | "institutional" | "established" | "independent";

export type CatalogSearchOptions = {
  query: string;
  /**
   * Comma-separated where more than one answer makes sense. A reader looking for
   * something to watch or read tonight wants video *and* pdf, and being made to
   * search twice to see both is the filter panel getting in the way of the
   * question.
   */
  format?: string;
  subject?: string;
  gradeLevel?: string;
  /** Subjects the reader does not want, comma-separated. */
  excludeSubjects?: string;
  /** Only match the query against titles and subjects, not descriptions. */
  titleOnly?: boolean;
  /** Earliest and latest publication year, inclusive. */
  publishedFrom?: number;
  publishedTo?: number;
  /** Author or contributor name to match. */
  author?: string;
  /** Require, or require the absence of, a preview image. */
  hasThumbnail?: boolean;
  language?: string;
  page?: number;
  limit?: number;
  /**
   * Row to start reading at, overriding the one derived from `page`. Callers
   * that top the catalog up between two searches pass the offset resolved
   * before the top-up so the newly stored rows extend the page instead of
   * shifting it. See {@link resolveCatalogOffset}.
   */
  offset?: number;
  /**
   * Point in the ranking to resume after, as a cursor from an earlier result.
   * Takes precedence over `offset` and `page`, and is the only way to page a
   * catalog that is still growing without repeating rows. See
   * {@link catalogCursor}.
   */
  after?: string;
  /**
   * Highest catalog row the caller already holds. Read together with `after`:
   * rows newer than this are returned whatever they rank, because a work stored
   * while the reader was reading can belong above the point they have read to
   * and would otherwise never be offered.
   */
  sinceId?: number;
  /**
   * Relevance a row must reach to be a result. Defaults to the standard bar;
   * callers lower it to widen a search that came back empty.
   */
  minRelevanceScore?: number;
  /**
   * Whether a narrow work must match more than one word of the query. Defaults
   * to true; dropped to widen a search that came back empty.
   */
  requireNarrowCoverage?: boolean;
  /**
   * Whether a row must match two words of the query, or one rare enough to
   * carry it alone. Off unless a caller sets it, so a search that never
   * resolved its distinguishing words is not silently held to a bar it has no
   * way to clear.
   */
  requireTopicCoverage?: boolean;
  /** The words rare enough to carry it, from resolveCatalogSearch. */
  distinguishingTerms?: string[];
  resultType?: "content" | "source" | "people";
  exactPhrase?: string;
  excludedWords?: string;
  source?: string;
  /** Provider or domain the reader does not want to see. */
  excludeSource?: string;
  /** Kinds of material wanted, comma-separated: book, course, reference, paper, primary. */
  material?: string;
  freshness?: string;
  accessType?: string;
  license?: string;
  /** Credibility tiers wanted, comma-separated. */
  sourceQuality?: string;
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
  sourceCredibility?: SourceCredibility;
  /** Where this row sits in the ranking. See {@link catalogCursor}. */
  cursor?: string;
  /** The stored row this came from, so a later page can ask for newer ones. */
  catalogId?: number;
};

export function canonicalCatalogUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["fbclid", "gclid", "si"].includes(key))
      url.searchParams.delete(key);
  }
  const host = url.hostname;
  const path = url.pathname;

  const openStaxBook = path.match(
    /^\/(?:details\/books|books)\/([^/]+)(?:\/.*)?$/i,
  );
  if (host === "openstax.org" && openStaxBook) {
    url.pathname = `/details/books/${openStaxBook[1]}`;
    url.search = "";
  }

  const mitCourse = path.match(/^\/courses\/([^/]+)(?:\/.*)?$/i);
  if (host === "ocw.mit.edu" && mitCourse) {
    url.pathname = `/courses/${mitCourse[1]}`;
    url.search = "";
  }

  const wikibook = path.match(/^\/wiki\/([^/]+)(?:\/.*)?$/i);
  if (host.endsWith(".wikibooks.org") && wikibook) {
    url.pathname = `/wiki/${wikibook[1]}`;
    url.search = "";
  }

  const openLibraryWork = path.match(/^\/works\/([^/]+)(?:\/.*)?$/i);
  if (host === "openlibrary.org" && openLibraryWork) {
    url.pathname = `/works/${openLibraryWork[1]}`;
    url.search = "";
  }

  const ncbiBook = path.match(/^\/books\/(NBK\d+)(?:\/.*)?$/i);
  if (host === "ncbi.nlm.nih.gov" && ncbiBook) {
    url.pathname = `/books/${ncbiBook[1]}`;
    url.search = "";
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

const ACADEMIC_PROVIDERS = new Set([
  "Harvard CS50",
  "MIT OpenCourseWare",
  "OpenStax",
  "Open Yale Courses",
  "Purdue OWL",
  "Stanford Encyclopedia of Philosophy",
  "University of Helsinki",
]);

const INSTITUTIONAL_PROVIDERS = new Set([
  "Library of Congress",
  "NASA",
  "Smithsonian Learning Lab",
]);

function defaultCredibility(provider: string): SourceCredibility {
  if (ACADEMIC_PROVIDERS.has(provider)) return "academic";
  if (INSTITUTIONAL_PROVIDERS.has(provider)) return "institutional";
  return "established";
}

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
  credibility: SourceCredibility = defaultCredibility(provider),
  language = "en",
): CuratedResource => ({
  provider,
  providerUrl,
  title,
  url,
  description,
  format,
  subject,
  gradeLevel,
  language,
  license,
  author,
  sourceKind: "curated",
  metadata: {
    accessType: "free",
    credibility,
    contentScope: "whole-work",
  },
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
  curated(
    "DOAJ",
    "https://doaj.org/",
    "Directory of Open Access Journals",
    "https://doaj.org/",
    "A quality-screened directory of peer-reviewed, fully open-access journals and articles across disciplines and languages.",
    "article",
    "Interdisciplinary Research",
    "Higher education",
    "Open-access licenses vary by journal",
    "DOAJ Foundation",
    "academic",
  ),
  curated(
    "CORE",
    "https://core.ac.uk/",
    "CORE Open Access Research",
    "https://core.ac.uk/",
    "A not-for-profit scholarly index aggregating research papers from repositories and journals around the world.",
    "article",
    "Interdisciplinary Research",
    "Higher education",
    "Open-access rights vary by paper",
    "The Open University and CORE community",
    "academic",
  ),
  curated(
    "ERIC",
    "https://eric.ed.gov/",
    "ERIC Education Research",
    "https://eric.ed.gov/",
    "The U.S. Department of Education database for journal articles, reports, and other education research.",
    "article",
    "Education",
    "Higher education",
    "Public database; document rights vary",
    "Institute of Education Sciences",
    "institutional",
  ),
  curated(
    "PubMed",
    "https://pubmed.ncbi.nlm.nih.gov/",
    "PubMed Biomedical Literature",
    "https://pubmed.ncbi.nlm.nih.gov/",
    "A National Library of Medicine index of biomedical and life-sciences literature with links to full text when available.",
    "article",
    "Biology and Health Sciences",
    "Higher education",
    "Citation database; article rights vary",
    "U.S. National Library of Medicine",
    "institutional",
  ),
  curated(
    "Europe PMC",
    "https://europepmc.org/",
    "Europe PMC Life Sciences Research",
    "https://europepmc.org/",
    "A free life-sciences literature service linking publications to data, reviews, protocols, and legal full-text copies.",
    "article",
    "Biology and Health Sciences",
    "Higher education",
    "Open-content rights vary by publication",
    "EMBL-EBI and Europe PMC funders",
    "academic",
  ),
  curated(
    "NCBI Bookshelf",
    "https://www.ncbi.nlm.nih.gov/books/",
    "NCBI Bookshelf",
    "https://www.ncbi.nlm.nih.gov/books/",
    "Complete biomedical books, reports, and reference works made searchable by the National Library of Medicine.",
    "other",
    "Biology and Health Sciences",
    "Higher education",
    "Free to read; work rights vary",
    "U.S. National Library of Medicine",
    "institutional",
  ),
  curated(
    "National Academies Press",
    "https://nap.nationalacademies.org/",
    "National Academies Press Open Books",
    "https://nap.nationalacademies.org/",
    "Consensus reports and full books in science, engineering, medicine, and public policy from the U.S. National Academies.",
    "pdf",
    "Science and Public Policy",
    "Higher education",
    "Free PDF access; publication rights vary",
    "National Academies of Sciences, Engineering, and Medicine",
    "academic",
  ),
  curated(
    "arXiv",
    "https://arxiv.org/",
    "arXiv Research Preprints",
    "https://arxiv.org/",
    "Open research preprints in physics, mathematics, computer science, quantitative biology, and related fields; items may not be peer reviewed.",
    "article",
    "STEM Research",
    "Higher education",
    "Open-access licenses vary by paper",
    "Cornell University",
    "academic",
  ),
  curated(
    "OpenAlex",
    "https://openalex.org/",
    "OpenAlex Scholarly Catalogue",
    "https://openalex.org/",
    "An open catalogue connecting scholarly works, authors, institutions, topics, venues, and citations.",
    "article",
    "Interdisciplinary Research",
    "Higher education",
    "CC0 metadata; linked work rights vary",
    "OurResearch",
    "academic",
  ),
  curated(
    "OpenLearn",
    "https://www.open.edu/openlearn/",
    "OpenLearn Free Courses",
    "https://www.open.edu/openlearn/free-courses",
    "Hundreds of complete free courses from The Open University across nine broad subject areas.",
    "interactive",
    "Interdisciplinary",
    "Secondary and higher education",
    "Free to access; item licenses vary",
    "The Open University",
    "academic",
  ),
  curated(
    "OER Commons",
    "https://oercommons.org/",
    "OER Commons",
    "https://oercommons.org/",
    "A curated public library for discovering, evaluating, adapting, and sharing openly licensed teaching and learning materials.",
    "interactive",
    "Interdisciplinary",
    "All levels",
    "Open licenses vary by resource",
    "ISKME",
    "established",
  ),
  curated(
    "MERLOT",
    "https://www.merlot.org/merlot/",
    "MERLOT Learning Materials",
    "https://www.merlot.org/merlot/index.htm",
    "A higher-education community collection of curated online learning materials, including peer-reviewed resources.",
    "interactive",
    "Interdisciplinary",
    "Higher education",
    "Resource rights vary",
    "California State University",
    "academic",
  ),
  curated(
    "Carnegie Mellon Open Learning Initiative",
    "https://oli.cmu.edu/",
    "Open Learning Initiative Courses",
    "https://oli.cmu.edu/courses/independent-learner-courses/",
    "Research-informed complete courses with interactive practice and immediate feedback for independent learners.",
    "interactive",
    "Interdisciplinary",
    "Secondary and higher education",
    "Free and paid options; course terms vary",
    "Carnegie Mellon University",
    "academic",
  ),
  curated(
    "Saylor Academy",
    "https://learn.saylor.org/",
    "Saylor Academy Free Courses",
    "https://learn.saylor.org/",
    "Self-paced, tuition-free courses in computing, business, mathematics, science, and the humanities.",
    "interactive",
    "Interdisciplinary",
    "Higher education",
    "Open licenses vary by course",
    "Saylor Academy",
    "established",
  ),
  curated(
    "NPTEL",
    "https://nptel.ac.in/",
    "NPTEL Courses",
    "https://nptel.ac.in/courses",
    "Complete engineering, science, humanities, and management courses produced by the IITs and IISc.",
    "video",
    "Interdisciplinary",
    "Higher education",
    "Free to access; provider terms apply",
    "Indian Institutes of Technology and IISc",
    "academic",
  ),
  curated(
    "METU OpenCourseWare",
    "https://ocw.metu.edu.tr/",
    "ODTU OpenCourseWare",
    "https://ocw.metu.edu.tr/",
    "Open course materials from Middle East Technical University across engineering, science, and the humanities.",
    "article",
    "Interdisciplinary",
    "Higher education",
    "Course licenses vary",
    "Middle East Technical University",
    "academic",
    "tr",
  ),
  curated(
    "CK-12",
    "https://www.ck12.org/",
    "CK-12 FlexBooks and Practice",
    "https://www.ck12.org/student/",
    "Customizable digital textbooks, simulations, and adaptive practice for K-12 mathematics and science.",
    "interactive",
    "Mathematics and Science",
    "Primary and secondary education",
    "CK-12 terms and licenses apply",
    "CK-12 Foundation",
    "established",
  ),
  curated(
    "Project Gutenberg",
    "https://www.gutenberg.org/",
    "Project Gutenberg Free Ebooks",
    "https://www.gutenberg.org/",
    "Complete public-domain books available in browser-friendly and downloadable formats, with one record per work.",
    "other",
    "Literature",
    "All levels",
    "Public domain in the United States; check local law",
    "Project Gutenberg Literary Archive Foundation",
    "established",
  ),
  curated(
    "Internet Encyclopedia of Philosophy",
    "https://iep.utm.edu/",
    "Internet Encyclopedia of Philosophy",
    "https://iep.utm.edu/",
    "Peer-reviewed, expert-authored philosophy reference articles maintained by academic editors.",
    "article",
    "Philosophy",
    "Higher education",
    "Free to access; copyright held by authors and editors",
    "University of Tennessee at Martin",
    "academic",
  ),
  curated(
    "Our World in Data",
    "https://ourworldindata.org/",
    "Our World in Data",
    "https://ourworldindata.org/",
    "Research-backed articles and reusable charts on global health, education, energy, poverty, population, and the environment.",
    "interactive",
    "Social Science and Data",
    "Secondary and higher education",
    "CC BY 4.0 unless otherwise noted",
    "Global Change Data Lab and University of Oxford researchers",
    "independent",
  ),
  curated(
    "Seeing Theory",
    "https://seeing-theory.brown.edu/",
    "Seeing Theory",
    "https://seeing-theory.brown.edu/",
    "A complete visual introduction to probability and statistics using interactive demonstrations.",
    "interactive",
    "Statistics",
    "Secondary and higher education",
    "MIT License for source code; site content rights apply",
    "Brown University",
    "academic",
  ),
  curated(
    "TeachEngineering",
    "https://www.teachengineering.org/",
    "TeachEngineering STEM Curriculum",
    "https://www.teachengineering.org/",
    "Standards-aligned engineering lessons, activities, and maker challenges developed by university partners.",
    "interactive",
    "Engineering",
    "Primary and secondary education",
    "Free to access; item licenses vary",
    "University of Colorado Boulder and partners",
    "academic",
  ),
  curated(
    "TED-Ed",
    "https://ed.ted.com/",
    "TED-Ed Lessons",
    "https://ed.ted.com/lessons",
    "Short animated lessons with discussion prompts and supporting materials across a broad range of subjects.",
    "video",
    "Interdisciplinary",
    "Primary and secondary education",
    "Free to access; TED terms apply",
    "TED-Ed",
    "established",
  ),
  curated(
    "3Blue1Brown",
    "https://www.youtube.com/@3blue1brown",
    "3Blue1Brown Mathematics",
    "https://www.youtube.com/@3blue1brown",
    "Visual mathematics series covering calculus, linear algebra, probability, neural networks, and mathematical intuition.",
    "video",
    "Mathematics",
    "Secondary and higher education",
    "Free to watch; creator and YouTube terms apply",
    "Grant Sanderson",
    "independent",
  ),
  curated(
    "Numberphile",
    "https://www.youtube.com/@numberphile",
    "Numberphile",
    "https://www.youtube.com/@numberphile",
    "Mathematicians explain number theory, geometry, probability, and unusual mathematical ideas through accessible videos.",
    "video",
    "Mathematics",
    "Secondary and higher education",
    "Free to watch; creator and YouTube terms apply",
    "Brady Haran and contributing mathematicians",
    "independent",
  ),
  curated(
    "Computerphile",
    "https://www.youtube.com/@Computerphile",
    "Computerphile",
    "https://www.youtube.com/@Computerphile",
    "Computer scientists explain programming, algorithms, security, networking, and computing history.",
    "video",
    "Computer Science",
    "Secondary and higher education",
    "Free to watch; creator and YouTube terms apply",
    "Brady Haran and contributing computer scientists",
    "independent",
  ),
  curated(
    "Crash Course",
    "https://www.youtube.com/@crashcourse",
    "Crash Course",
    "https://www.youtube.com/@crashcourse",
    "Structured educational video series spanning sciences, humanities, economics, computing, and study skills.",
    "video",
    "Interdisciplinary",
    "Secondary and higher education",
    "Free to watch; creator and YouTube terms apply",
    "Complexly",
    "established",
  ),
  curated(
    "PBS Space Time",
    "https://www.youtube.com/@pbsspacetime",
    "PBS Space Time",
    "https://www.youtube.com/@pbsspacetime",
    "Research-informed explanations of astrophysics, cosmology, quantum mechanics, and frontier physics.",
    "video",
    "Physics",
    "Secondary and higher education",
    "Free to watch; PBS and YouTube terms apply",
    "PBS Digital Studios",
    "institutional",
  ),
  curated(
    "StatQuest",
    "https://www.youtube.com/@statquest",
    "StatQuest with Josh Starmer",
    "https://www.youtube.com/@statquest",
    "Clear, topic-organized explanations of statistics, machine learning, and data science concepts.",
    "video",
    "Statistics and Data Science",
    "Secondary and higher education",
    "Free to watch; creator and YouTube terms apply",
    "Josh Starmer",
    "independent",
  ),
  curated(
    "freeCodeCamp",
    "https://www.freecodecamp.org/",
    "freeCodeCamp Full Courses",
    "https://www.youtube.com/@freecodecamp",
    "Long-form, complete programming and computer-science courses published by an education nonprofit.",
    "video",
    "Computer Science",
    "Secondary and higher education",
    "Free to access; content licenses vary",
    "freeCodeCamp.org",
    "established",
  ),
  curated(
    "Professor Leonard",
    "https://www.youtube.com/@ProfessorLeonard",
    "Professor Leonard Mathematics Courses",
    "https://www.youtube.com/@ProfessorLeonard",
    "Complete classroom-style courses in algebra, precalculus, calculus, differential equations, and statistics.",
    "video",
    "Mathematics",
    "Secondary and higher education",
    "Free to watch; creator and YouTube terms apply",
    "Professor Leonard",
    "independent",
  ),
  curated(
    "The Odin Project",
    "https://www.theodinproject.com/",
    "The Odin Project Full-Stack Curriculum",
    "https://www.theodinproject.com/paths",
    "A free, open-source project-based curriculum for complete JavaScript and Ruby full-stack learning paths.",
    "interactive",
    "Full-Stack Web Development",
    "Secondary and higher education",
    "CC BY-NC-SA 4.0",
    "The Odin Project community",
    "independent",
  ),
  curated(
    "Eloquent JavaScript",
    "https://eloquentjavascript.net/",
    "Eloquent JavaScript",
    "https://eloquentjavascript.net/",
    "The complete online edition of Marijn Haverbeke's book on JavaScript, programming, browsers, and Node.js.",
    "other",
    "Computer Science",
    "Secondary and higher education",
    "CC BY-NC 3.0 for the book; code under MIT",
    "Marijn Haverbeke",
    "independent",
  ),
  curated(
    "BetterExplained",
    "https://betterexplained.com/",
    "BetterExplained Mathematics Guides",
    "https://betterexplained.com/archives/",
    "Intuition-first guides to arithmetic, algebra, calculus, linear algebra, probability, and mathematical reasoning.",
    "article",
    "Mathematics",
    "Secondary and higher education",
    "Free to access; author terms apply",
    "Kalid Azad",
    "independent",
  ),
  curated(
    "The Physics Classroom",
    "https://www.physicsclassroom.com/",
    "The Physics Classroom",
    "https://www.physicsclassroom.com/",
    "A complete conceptual physics tutorial with interactives, multimedia, problem sets, and teacher resources.",
    "interactive",
    "Physics",
    "Secondary education",
    "Free to access; site terms apply",
    "The Physics Classroom",
    "independent",
  ),
  curated(
    "World History Encyclopedia",
    "https://www.worldhistory.org/",
    "World History Encyclopedia",
    "https://www.worldhistory.org/",
    "Editorially reviewed articles, maps, timelines, images, and teaching resources from an education nonprofit.",
    "article",
    "History",
    "Secondary and higher education",
    "CC BY-NC-SA 4.0 unless otherwise noted",
    "World History Encyclopedia",
    "established",
  ),
  curated(
    "TUBITAK Bilim Genc",
    "https://bilimgenc.tubitak.gov.tr/",
    "TUBITAK Bilim Genc",
    "https://bilimgenc.tubitak.gov.tr/",
    "Turkish-language science articles, experiments, puzzles, projects, and current research explainers for young learners.",
    "article",
    "Science",
    "Primary and secondary education",
    "Free to access; TUBITAK terms apply",
    "TUBITAK",
    "institutional",
    "tr",
  ),
  curated(
    "Mathigon",
    "https://mathigon.org/",
    "Mathigon Interactive Mathematics",
    "https://mathigon.org/",
    "Interactive courses, manipulatives, and activities that teach mathematics through exploration and visual reasoning.",
    "interactive",
    "Mathematics",
    "Primary and secondary education",
    "Free to access; provider terms apply",
    "Mathigon",
    "established",
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
  const uniqueItems = [
    ...new Map(
      items.map((item) => {
        const canonicalUrl = canonicalCatalogUrl(item.canonicalUrl);
        return [canonicalUrl, { ...item, canonicalUrl }];
      }),
    ).values(),
  ];
  const now = new Date().toISOString();
  for (let offset = 0; offset < uniqueItems.length; offset += 50) {
    await db
      .insert(catalogResourcesTable)
      .values(uniqueItems.slice(offset, offset + 50))
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
  return uniqueItems.length;
}

export async function ensureCuratedCatalog() {
  return upsertCatalogResources(CURATED_RESOURCES.map(prepared));
}

const filterTokens = (value: string) =>
  value.trim().split(/\s+/).filter(Boolean).slice(0, 8);


/**
 * What one query word is worth against a row.
 *
 * A word in the title or the subject says the work *is about* that; the same
 * word in a description says only that it came up. Scoring those the same is
 * how "AP Physics C: Electricity and Mechanics" was answered with a
 * physicist's biography, a Florida high school and the history of nuclear
 * power — each mentions one of those words in passing. Weighting the fields
 * separates a resource on the topic from one that merely name-drops it.
 */
const STRONG_FIELD_SCORE = 2;
const WEAK_FIELD_SCORE = 1;

/**
 * The bar a row clears to be a result at all: one query word in the title or
 * subject, or two mentioned anywhere. Anything less is a coincidence.
 */
const MIN_RELEVANCE_SCORE = 2;

/**
 * The words a row is actually judged against.
 *
 * Not every word someone types is a claim about the subject. "kinematics
 * projectile motion tutorial" is three words about physics and one about the
 * shape of the answer, and scoring all four alike let a t-shirt printing video
 * clear the bar on "tutorial" alone — a quarter of the query, worth the full
 * two points because it happened to be in the title.
 *
 * So the bar is set against the topic words and met by the topic words. The
 * packaging words still count towards the *ranking* further down, where
 * preferring the tutorial among two works on kinematics is exactly right.
 *
 * A query made only of packaging is left whole. "practice problems" is a real
 * search, and the alternative to judging it on those words is not judging it
 * at all.
 */
function relevanceTerms(terms: string[]): string[] {
  const topical = topicalSearchTerms(terms);
  return topical.length ? topical : terms;
}

/**
 * The bar for *this* query.
 *
 * A flat two points is backwards for short queries. Against a four-word query
 * two points is a third of the query and rightly permissive; against a
 * one-word query it is the maximum score, so it demands the word be in the
 * title or the subject and nothing else will do. That is what made a search for
 * "photosynthesis" stop at the dozen works with the word in their name, and
 * "mitosis" run dry on page two, while the works actually *about* the topic —
 * chlorophyll, the Calvin cycle, the cell cycle — sat in the catalog and could
 * not be reached at all. When the whole query is one real word, a work that
 * mentions it is an answer.
 *
 * A lone abbreviation stays strict. "AP" appearing somewhere is not a topic,
 * and relaxing that is how a Florida high school answered an AP Physics search.
 */
function requiredRelevanceScore(terms: string[]): number {
  const substantive = terms.filter(
    (term) => term.length >= SUBSTANTIVE_TERM_LENGTH,
  );
  return terms.length === 1 && substantive.length === 1
    ? WEAK_FIELD_SCORE
    : MIN_RELEVANCE_SCORE;
}

function catalogTermScore(term: string): SQL<number> {
  const pattern = wordStartPattern(term);
  return sql<number>`case
    when ${catalogResourcesTable.title} ~* ${pattern}
      or ${catalogResourcesTable.subject} ~* ${pattern}
      then ${STRONG_FIELD_SCORE}
    when coalesce(${catalogResourcesTable.description}, '') ~* ${pattern}
      or ${catalogResourcesTable.provider} ~* ${pattern}
      or coalesce(${catalogResourcesTable.author}, '') ~* ${pattern}
      then ${WEAK_FIELD_SCORE}
    else 0 end`;
}

/** How well a row answers the whole query. */
function catalogRelevanceScore(terms: string[]): SQL<number> {
  if (!terms.length) return sql<number>`0`;
  return sql<number>`(${sql.join(terms.map(catalogTermScore), sql` + `)})`;
}

/** How many of the query's words a row matches at all, regardless of where. */
function catalogCoverage(terms: string[]): SQL<number> {
  if (!terms.length) return sql<number>`0`;
  return sql<number>`(${sql.join(
    terms.map(
      (term) => sql<number>`case when ${catalogTermScore(term)} > 0 then 1 else 0 end`,
    ),
    sql` + `,
  )})`;
}

/**
 * Works narrow enough that one word in common is a coincidence.
 *
 * A paper and a video are single, specific things with descriptive titles, and
 * the catalog holds them in bulk. "Kinematics projectile motion" turned up
 * eight papers on strabismic imaging, micro-Doppler radar and adversarial
 * synthetic data — each matching "motion" and nothing else — alongside a video
 * about motion graphics in a design tool.
 *
 * Reference works are the opposite: their titles *are* topic names, so a
 * single word matching "Kinematics" or "Newton's laws of motion" is the
 * strongest evidence there is. Holding those two kinds to the same rule is
 * what forces the choice between keeping the papers and losing the articles.
 *
 * Measured against the live catalog before it was written: of twenty-seven
 * videos returned for four ordinary questions, twenty-five already matched two
 * words or more. The rule costs almost nothing and removes almost all of it.
 */
const NARROW_MATERIALS = ["paper", "video"];

/** Words of the query a narrow work has to match. */
const MIN_NARROW_COVERAGE = 2;

/** Words of the query any work has to match, absent a distinguishing one. */
const MIN_TOPIC_COVERAGE = 2;

/**
 * How much rarer than the query's commonest word a word must be to answer the
 * question on its own.
 *
 * "French revolution" was answered with the Russian Revolution, the American
 * Revolution and the Armenian revolutionary movement, each matching
 * "revolution" and nothing else, because a reference work's title being a
 * topic name is normally the strongest evidence there is — and here it lands
 * on a different topic that shares a word.
 *
 * Counting words cannot separate those from "Newton's laws of motion", which
 * is the same shape and is wanted. What separates them is that the catalog is
 * full of revolutions and thin on kinematics: a word the catalog uses
 * constantly says almost nothing about which work answers the question, and a
 * word it barely uses says almost everything.
 *
 * Measured against the query rather than against a fixed number of rows, so it
 * needs no tuning as the catalog grows and cannot drift as its shape changes.
 * When every word of a query is equally common — "french revolution", where
 * neither word is rare — nothing is distinguishing and the rule falls back to
 * asking for both, which is the right answer for a two-word question anyway.
 */
const RARITY_GAP = 4;

/**
 * The share of the catalog below which a word is distinguishing on its own,
 * whatever else was typed beside it. Two per cent of a catalog is few enough
 * that a work using the word is very likely the one being asked for.
 */
const RARE_SHARE = 0.02;

/** How many works each word of a query appears in, against how many there are. */
type TermFrequencies = { total: number; frequencies: Map<string, number> };

/** How long a word's frequency is trusted before the catalog is asked again. */
const FREQUENCY_TTL_MS = 5 * 60_000;

const frequencyCache = new Map<string, { count: number; at: number }>();
let cachedCatalogSize: { count: number; at: number } | null = null;

/** Test seam: frequencies outlive a fixture that replaces the whole catalog. */
export function clearTermFrequencyCache() {
  frequencyCache.clear();
  cachedCatalogSize = null;
}

/**
 * How many works each word appears in.
 *
 * One aggregate for the whole query rather than one per word, and cached,
 * because this runs before every search and the answer moves slowly: a word's
 * share of the catalog is stable even while rows are being added to it.
 */
async function termDocumentFrequencies(
  terms: string[],
): Promise<TermFrequencies> {
  const now = Date.now();
  const frequencies = new Map<string, number>();
  const uncounted: string[] = [];
  for (const term of terms) {
    const cached = frequencyCache.get(term.toLowerCase());
    if (cached && now - cached.at < FREQUENCY_TTL_MS)
      frequencies.set(term, cached.count);
    else if (!uncounted.includes(term)) uncounted.push(term);
  }
  const sizeIsFresh =
    cachedCatalogSize !== null && now - cachedCatalogSize.at < FREQUENCY_TTL_MS;
  if (!uncounted.length && sizeIsFresh)
    return { total: cachedCatalogSize!.count, frequencies };

  const selection: Record<string, SQL<number>> = {
    total: sql<number>`count(*)::int`,
  };
  uncounted.forEach((term, index) => {
    selection[`df${index}`] =
      sql<number>`count(*) filter (where ${catalogTermScore(term)} > 0)::int`;
  });
  const [row] = await db.select(selection).from(catalogResourcesTable);
  const read = (key: string) =>
    Number((row as Record<string, unknown> | undefined)?.[key] ?? 0);
  uncounted.forEach((term, index) => {
    const count = read(`df${index}`);
    frequencyCache.set(term.toLowerCase(), { count, at: now });
    frequencies.set(term, count);
  });
  const total = read("total");
  cachedCatalogSize = { count: total, at: now };
  return { total, frequencies };
}

/**
 * The words of a query rare enough to answer it without help.
 *
 * Two ways to qualify, and the second is not a refinement — without it the
 * rule is simply wrong for a whole class of question. Rarity measured against
 * the query's own commonest word says nothing when every word of the query is
 * already rare: "guillotine barricades" has a commonest word appearing in one
 * work, so nothing is four times rarer than it, and the question goes
 * unanswered while its answer sits in the catalog.
 *
 * So a word also stands alone when it appears in a small enough share of the
 * catalog, whatever was typed beside it. A share rather than a count, because
 * the same fixed number is "almost nothing" in a catalog of twenty thousand
 * works and "most of it" in a catalog of fifty.
 */
export function rareEnoughToStandAlone({
  total,
  frequencies,
}: TermFrequencies): string[] {
  const counts = [...frequencies.values()];
  if (!counts.length) return [];
  const commonest = Math.max(...counts);
  const outright = Math.max(1, total * RARE_SHARE);
  return [...frequencies.entries()]
    .filter(([, count]) => count * RARITY_GAP <= commonest || count <= outright)
    .map(([term]) => term);
}

function catalogConditions(options: CatalogSearchOptions): SQL[] {
  const conditions: SQL[] = [];
  const searchTerms = meaningfulSearchTerms(options.query);
  if (searchTerms.length) {
    // Scored against the topic words only, which subsumes the old rule that at
    // least one word of real length be among those matched: an abbreviation is
    // too short to be a topic word, so "AP Physics" can no longer be answered
    // by anything with "AP" in its title that never mentions physics.
    const judged = relevanceTerms(searchTerms);
    const required =
      options.minRelevanceScore ?? requiredRelevanceScore(judged);
    conditions.push(sql`${catalogRelevanceScore(judged)} >= ${required}`);
    // A question with several words in it can tell a work about the topic from
    // one that happens to share a word — but only for the works narrow enough
    // that sharing one word means nothing. Skipped for a one-word question,
    // where matching two is impossible.
    if (
      judged.length >= MIN_NARROW_COVERAGE &&
      options.requireNarrowCoverage !== false
    )
      conditions.push(sql`(
        coalesce(${catalogResourcesTable.metadata}->>'material', '') not in (${sql.join(
          NARROW_MATERIALS.map((material) => sql`${material}`),
          sql`, `,
        )})
        or ${catalogCoverage(judged)} >= ${MIN_NARROW_COVERAGE})`);
    // And for every kind of work: a row that matched one word, where that word
    // is one the catalog is full of, has not answered a question made of
    // several. Matching a word the catalog barely uses is enough on its own —
    // that is what tells "Basic kinematics" from "Russian Revolution", which
    // are otherwise the same shape.
    if (options.requireTopicCoverage && judged.length >= MIN_TOPIC_COVERAGE) {
      const distinguishing = (options.distinguishingTerms ?? []).filter(
        (term) => judged.includes(term),
      );
      conditions.push(
        distinguishing.length
          ? sql`(${catalogCoverage(judged)} >= ${MIN_TOPIC_COVERAGE}
              or ${catalogRelevanceScore(distinguishing)} > 0)`
          : sql`${catalogCoverage(judged)} >= ${MIN_TOPIC_COVERAGE}`,
      );
    }
    // "In the title" means the topic *is* what the work is about, not something
    // it mentions. A description match is worth one point and a title or subject
    // match two, so requiring the strong score on a word is the whole rule.
    if (options.titleOnly)
      for (const term of judged)
        conditions.push(
          sql`${catalogTermScore(term)} = ${STRONG_FIELD_SCORE}`,
        );
  }
  // Each of these accepts a list. Asked for one value they behave exactly as
  // they did; asked for several they widen, which is what a reader means by
  // ticking two boxes rather than being made to search twice.
  const formats = filterValues(options.format).filter((value) =>
    CATALOG_FORMATS.includes(value as ResourceFormat),
  ) as ResourceFormat[];
  // An OR of equalities rather than inArray: drizzle's enum-column overloads do
  // not accept a plain array of the enum's own values, and this reads the same.
  if (formats.length)
    conditions.push(
      or(...formats.map((value) => eq(catalogResourcesTable.format, value)))!,
    );

  const subjects = filterValues(options.subject);
  if (subjects.length)
    conditions.push(
      or(
        ...subjects.map((subject) =>
          ilike(catalogResourcesTable.subject, `%${subject}%`),
        ),
      )!,
    );

  const gradeLevels = filterValues(options.gradeLevel);
  if (gradeLevels.length)
    conditions.push(
      or(
        ...gradeLevels.map((level) =>
          ilike(catalogResourcesTable.gradeLevel, `%${level}%`),
        ),
        // A work marked for all levels answers every grade, so it is never the
        // thing a grade filter is trying to remove.
        ilike(catalogResourcesTable.gradeLevel, "%All levels%"),
      )!,
    );

  // Subjects the reader is tired of. Separate from excluded *words*, which match
  // anywhere: this one is about how the work is filed.
  for (const subject of filterValues(options.excludeSubjects))
    conditions.push(
      not(ilike(catalogResourcesTable.subject, `%${subject}%`)),
    );

  if (options.author)
    conditions.push(
      ilike(
        sql`coalesce(${catalogResourcesTable.author}, '')`,
        `%${options.author}%`,
      ),
    );

  // A year on its own, compared against the stored instant. A work with no
  // publication date is not silently kept: a reader asking for recent material
  // does not want everything of unknown age.
  if (Number.isFinite(options.publishedFrom))
    conditions.push(
      sql`${catalogResourcesTable.publishedAt} >= ${`${Math.trunc(options.publishedFrom!)}-01-01T00:00:00.000Z`}`,
    );
  if (Number.isFinite(options.publishedTo))
    conditions.push(
      sql`${catalogResourcesTable.publishedAt} < ${`${Math.trunc(options.publishedTo!) + 1}-01-01T00:00:00.000Z`}`,
    );

  if (options.hasThumbnail === true)
    conditions.push(sql`${catalogResourcesTable.thumbnailUrl} is not null`);
  if (options.hasThumbnail === false)
    conditions.push(sql`${catalogResourcesTable.thumbnailUrl} is null`);
  if (options.language && options.language !== "any")
    conditions.push(eq(catalogResourcesTable.language, options.language));
  if (options.source)
    conditions.push(
      ilike(catalogResourcesTable.provider, `%${options.source}%`),
    );
  // Matched against the provider *and* the link, so both "Wikipedia" and
  // "wikipedia.org" drop the same results — a reader excluding a source should
  // not have to guess which of the two the catalog stored.
  if (options.excludeSource) {
    const pattern = `%${options.excludeSource}%`;
    conditions.push(
      not(
        or(
          ilike(catalogResourcesTable.provider, pattern),
          ilike(catalogResourcesTable.canonicalUrl, pattern),
          ilike(catalogResourcesTable.providerUrl, pattern),
        )!,
      ),
    );
  }
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
  // What kind of thing the reader wants. The catalog now holds encyclopedia
  // articles, textbooks, courses, primary texts and peer-reviewed papers, and
  // those answer different questions: a GCSE revision search and a dissertation
  // search want opposite ends of that list. Rows stored before a source declared
  // its material have none, so they are absent from a filtered result rather
  // than guessed into one.
  const materials = filterValues(options.material);
  if (materials.length)
    conditions.push(
      or(
        ...materials.map(
          (material) =>
            sql`coalesce(${catalogResourcesTable.metadata}->>'material', '') = ${material}`,
        ),
      )!,
    );
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
  const credibilities = filterValues(options.sourceQuality).filter((value) =>
    ["academic", "institutional", "established", "independent"].includes(value),
  );
  if (credibilities.length)
    conditions.push(
      or(
        ...credibilities.map(
          (credibility) =>
            sql`coalesce(${catalogResourcesTable.metadata}->>'credibility', '') = ${credibility}`,
        ),
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

  return conditions;
}

/** Cards asked for per page. */
function catalogPageSize(options: CatalogSearchOptions) {
  return Math.min(24, Math.max(1, options.limit ?? 16));
}

/**
 * Rows read per page. Source mode collapses many rows into one card per
 * provider, so it reads a wider window — and must therefore page by that
 * window, not by the card count, or page 2 re-reads most of page 1.
 */
function catalogFetchWindow(options: CatalogSearchOptions) {
  const pageSize = catalogPageSize(options);
  return options.resultType === "source" ? pageSize * 4 : pageSize;
}

/**
 * Where a row sits in the ranking, as sortable text.
 *
 * Positional paging cannot survive a catalog that grows while a reader reads it.
 * The order is by relevance, so a work stored during the reader's third page can
 * belong on their first, and every row below it shifts down — straight back into
 * a window an earlier page already showed. Measured on a cold catalog, a third
 * of every "search more" page was results the reader already had; on a catalog
 * that had stopped growing, none of it was.
 *
 * A cursor fixes that by naming a place in the ranking rather than counting rows
 * to skip. Rows inserted after the reader passed that place are simply behind
 * them, and rows inserted ahead of it come back on the next page. The fields are
 * fixed-width and in sort order — score descending, then relevance, then id — so
 * plain text comparison is the ranking comparison, and a client that reordered
 * or filtered its results can still find the furthest one it holds by taking the
 * largest string.
 */
const CURSOR_SCORE_CEILING = 9999;
/**
 * Four fields, and the band comes first.
 *
 * The band is what stops one provider owning a page. Relevance alone hands every
 * slot to whichever source is biggest — Wikipedia has an article on everything,
 * so a page with books, courses and papers waiting behind it showed eleven
 * Wikipedia articles out of fifteen. Reordering the page after the fact could not
 * fix that: the window had already been chosen by relevance, so the other sources
 * were never fetched. The band puts the interleaving into the ordering itself, so
 * the *window* is diverse rather than just its arrangement.
 *
 * A three-field cursor is one this code wrote before the band existed. It is
 * rejected rather than reinterpreted: read as a banded cursor it would name a
 * different place in a different order, and paging from the wrong place is
 * exactly the defect the cursor was introduced to remove. A rejected cursor falls
 * back to positional paging for that one request, which is what the reader would
 * have had anyway.
 */
const CURSOR_PATTERN = /^(\d{2})\.(\d{4})\.(\d)\.(\d{12})$/;

/**
 * How many results one source contributes before yielding to the others.
 *
 * Part of the cursor's meaning, so it is a constant rather than a per-request
 * option: change it and every cursor already in flight names a different place.
 */
export const SOURCE_BAND_SIZE = 2;

/**
 * How many turns the paper sources give up on a non-research question.
 *
 * Two, so every other kind of source has had its two results before the first
 * paper appears. Part of the cursor's meaning, like the band size: change it and
 * every cursor already in flight names a different place.
 */
export const PAPER_BAND_DELAY = 2;

export function catalogCursor(
  band: number,
  score: number,
  relevance: number,
  id: number,
): string {
  const inverted = Math.max(
    0,
    Math.min(CURSOR_SCORE_CEILING, CURSOR_SCORE_CEILING - Math.trunc(score)),
  );
  return [
    String(Math.max(0, Math.min(99, Math.trunc(band)))).padStart(2, "0"),
    String(inverted).padStart(4, "0"),
    String(Math.max(0, Math.min(9, Math.trunc(relevance)))),
    String(Math.max(0, Math.trunc(id))).padStart(12, "0"),
  ].join(".");
}

export function parseCatalogCursor(
  value: string | undefined,
): { band: number; score: number; relevance: number; id: number } | null {
  const match = CURSOR_PATTERN.exec(value?.trim() ?? "");
  if (!match) return null;
  return {
    band: Number(match[1]),
    score: CURSOR_SCORE_CEILING - Number(match[2]),
    relevance: Number(match[3]),
    id: Number(match[4]),
  };
}

/**
 * The row page N should start at.
 *
 * A plain `(page - 1) * window` overshoots as soon as the stored catalog runs
 * out: page 2 of a six-row result set reads from row 16, returns nothing, and
 * "Search more resources" looks broken even when a remote top-up has just
 * added rows. Clamping to the number of rows that currently match resumes
 * exactly where the catalog ended — no gap, and no repeat of rows an earlier
 * page already showed.
 *
 * Resolve this once, before any top-up, and pass it to every searchCatalog
 * call for that request: rows added in between get the highest ids and sort
 * last, so a stale offset would skip them.
 */
async function countCatalogMatches(
  options: CatalogSearchOptions,
): Promise<number> {
  const conditions = catalogConditions(options);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogResourcesTable)
    .where(conditions.length ? and(...conditions) : undefined);
  return Number(row?.count ?? 0);
}

export type ResolvedCatalogSearch = {
  /** Relevance bar for this query, decided once for every page of it. */
  minRelevanceScore: number;
  /** Whether narrow works must match more than one word, likewise once. */
  requireNarrowCoverage: boolean;
  /** Whether a row must match two words, or one rare enough to stand alone. */
  requireTopicCoverage: boolean;
  /** The words of this query that are rare enough to stand alone. */
  distinguishingTerms: string[];
  /** Row this page starts at. */
  offset: number;
  /** Rows matching before any top-up. */
  total: number;
};

/**
 * Settle how strict this search is and where the page starts.
 *
 * Both decisions belong to the query, not the page. A long query demands two
 * matching words, which is right when the catalog holds something on the topic
 * and wrong when it holds one loosely related thing — so it relaxes, but it
 * relaxes for *every* page or not at all. Deciding per page is what made page
 * three repeat page two almost entirely: page one found seven strict matches
 * and stopped there, later pages found none, relaxed, and each re-read the
 * same loose rows from an offset measured against the strict set.
 *
 * Resolve this once, before any top-up, and pass both values to every
 * searchCatalog call for the request: rows stored in between get the highest
 * ids and sort last, so a re-derived offset would step over them.
 */
export async function resolveCatalogSearch(
  options: CatalogSearchOptions,
): Promise<ResolvedCatalogSearch> {
  if (options.resultType === "people")
    return {
      minRelevanceScore: 1,
      requireNarrowCoverage: false,
      requireTopicCoverage: false,
      distinguishingTerms: [],
      offset: 0,
      total: 0,
    };

  // The same words the conditions will judge against, or the count and the
  // fetch disagree about what the bar is and page two reads from the wrong row.
  const judged = relevanceTerms(meaningfulSearchTerms(options.query));
  let minRelevanceScore = requiredRelevanceScore(judged);
  // Which of them are rare enough to answer the question alone. Counted once,
  // here, for the same reason the bar is: every page of a query has to be
  // measured against the same ruler or the offsets stop lining up.
  const distinguishingTerms =
    judged.length >= MIN_TOPIC_COVERAGE
      ? rareEnoughToStandAlone(await termDocumentFrequencies(judged))
      : [];
  const requireTopicCoverage = judged.length >= MIN_TOPIC_COVERAGE;
  let requireNarrowCoverage = true;

  const count = () =>
    countCatalogMatches({
      ...options,
      minRelevanceScore,
      requireNarrowCoverage,
      requireTopicCoverage,
      distinguishingTerms,
    });

  // Loosened one rule at a time, strongest first, and only ever because the
  // stricter reading found nothing at all.
  //
  // The topic rule is never loosened, and used to be. Dropping it means "one
  // word in common will do", and when nothing matches two words of a question
  // the word left over is by definition the ordinary one: "cold war" came back
  // as fifteen videos about the Punic Wars, each matching "war", each
  // correctly filed under History, none of them an answer.
  //
  // An empty page reads as a failure and a page of wrong answers reads as an
  // insult, but only one of them is also misleading about what the catalog
  // holds. And empty is not where it ends — a thin page is what sends the
  // endpoint to the providers, so the honest empty result becomes real cold
  // war videos a moment later, where the loose one only ever became Carthage.
  let total = await count();
  if (total === 0) {
    // Only papers and videos share a word with this question, so the rule that
    // one shared word is not enough for them has nothing left to keep. Sooner
    // than an empty page, take them — this is the query where a paper on
    // micro-Doppler radar is the best the catalog has.
    requireNarrowCoverage = false;
    total = await count();
  }
  if (total === 0 && minRelevanceScore > 1) {
    // Nothing is *about* the query. Rather than an empty page, accept works
    // that mention it — for every page of this query, so paging stays whole.
    minRelevanceScore = 1;
    total = await count();
  }

  const page = Math.max(1, options.page ?? 1);
  // Clamped to what matched: a plain (page - 1) * window overshoots as soon as
  // the catalog runs out, so page 2 of a six-row result read from row 16 and
  // returned nothing even after a top-up had just added rows.
  const offset =
    page === 1
      ? 0
      : Math.min((page - 1) * catalogFetchWindow(options), total);
  return {
    minRelevanceScore,
    requireNarrowCoverage,
    requireTopicCoverage,
    distinguishingTerms,
    offset,
    total,
  };
}

export async function searchCatalog(
  options: CatalogSearchOptions,
): Promise<CatalogSearchItem[]> {
  if (options.resultType === "people") return [];
  const conditions = catalogConditions(options);

  const page = Math.max(1, options.page ?? 1);
  const limit = catalogPageSize(options);
  const window = catalogFetchWindow(options);
  const query = options.query.trim();
  const relevance = query
    ? sql<number>`case when lower(${catalogResourcesTable.title}) = lower(${query}) then 0 when ${catalogResourcesTable.title} ilike ${`%${query}%`} then 1 when ${catalogResourcesTable.subject} ilike ${`%${query}%`} then 2 else 3 end`
    : sql<number>`3`;
  // Clearing the bar is a floor, not a ranking: a work that merely mentions
  // the topic must not outrank one whose title is the topic.
  const searchTerms = meaningfulSearchTerms(options.query);
  const score = catalogRelevanceScore(searchTerms);

  // A cursor names a place in the ranking, so it replaces the offset rather
  // than adding to it: everything strictly after that place, in the same order.
  //
  // Or newer than everything the reader holds. That second half is what makes
  // the cursor an improvement rather than a trade: this endpoint stores works as
  // it finds them, and a work stored during the reader's second page can belong
  // on their first. Ranking alone would put it behind them forever, and paging
  // "shakespeare" lost a third of its results that way — each page thinner than
  // the last while newly stored plays and sonnets piled up out of reach.
  const resume = parseCatalogCursor(options.after);
  const sinceId = Number.isFinite(options.sinceId)
    ? Math.max(0, Math.trunc(options.sinceId!))
    : null;
  const offset = resume ? 0 : Math.max(0, options.offset ?? (page - 1) * window);

  // Each source's own position in its own results, turned into a band: its two
  // best answers are band 0, its next two band 1, and so on. Ordering by band
  // first interleaves the sources *before* the window is cut, which is the whole
  // point — reordering afterwards can only rearrange rows relevance had already
  // chosen, and relevance chose eleven Wikipedia articles out of fifteen.
  //
  // Ascending id is the tie-break throughout, not last_synced_at. Rows are
  // upserted in batches that share a sync timestamp, so ordering by it left ties
  // for Postgres to break however it liked and page 2 could hand back rows page 1
  // had already shown. Id is unique and never changes.
  //
  // The band is computed before the cursor is applied, so it means "this row's
  // place in the whole ranking" rather than "its place among what is left". A
  // cursor from an earlier page therefore still names the same place.
  // Papers wait their turn on a question that is not asking for research.
  //
  // Interleaving alone treats every source as equally wanted, and for a literature
  // question that is wrong in a way a reader notices: "hamlet soliloquy folio"
  // came back with six arXiv preprints analysing the play out of sixteen results,
  // ahead of the play itself. Pushing the paper sources back two bands means the
  // books, the encyclopedia and the primary texts each get their two first.
  //
  // Not a filter: nothing is dropped, and a reader who paged far enough would
  // still reach the papers. And no penalty at all when the reader asked for
  // papers — an explicit filter is not a preference to be second-guessed — or
  // when the query names a field where a paper is the normal answer.
  const wantsResearch =
    queryWantsResearch(searchTerms) ||
    filterValues(options.material).includes("paper");
  const paperDelay = wantsResearch ? 0 : PAPER_BAND_DELAY;
  const band = sql<number>`(((row_number() over (
    partition by ${catalogResourcesTable.provider}
    order by ${score} desc, ${relevance} asc, ${catalogResourcesTable.id} asc
  ) - 1) / ${SOURCE_BAND_SIZE})
    + case when coalesce(${catalogResourcesTable.metadata}->>'material', '') = 'paper'
      then ${paperDelay} else 0 end)::int`;

  const ranked = db
    // The band, score and relevance are selected alongside the row because they
    // are what the cursor is made of: recomputing them anywhere else would be a
    // second copy of the ranking, free to disagree with this one.
    .select({
      ...getTableColumns(catalogResourcesTable),
      // Aliased explicitly: a computed field cannot be referenced from outside a
      // subquery without a name, and the outer query orders and filters by all
      // three of these.
      score: score.as("score"),
      relevance: relevance.as("relevance"),
      band: band.as("band"),
    })
    .from(catalogResourcesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .as("ranked");

  // Everything strictly after the place the cursor names, in the same order.
  //
  // Or newer than everything the reader holds. That second half is what makes
  // the cursor an improvement rather than a trade: this endpoint stores works as
  // it finds them, and a work stored during the reader's second page can belong
  // on their first. Ranking alone would put it behind them forever, and paging
  // "shakespeare" lost a third of its results that way — each page thinner than
  // the last while newly stored plays and sonnets piled up out of reach.
  const afterCursor = resume
    ? sql`(${ranked.band} > ${resume.band}
        or (${ranked.band} = ${resume.band}
          and (${ranked.score} < ${resume.score}
            or (${ranked.score} = ${resume.score}
              and (${ranked.relevance} > ${resume.relevance}
                or (${ranked.relevance} = ${resume.relevance}
                  and ${ranked.id} > ${resume.id}))))))`
    : null;
  const storedSince =
    resume && sinceId !== null ? sql`${ranked.id} > ${sinceId}` : null;
  const unread =
    afterCursor && storedSince
      ? sql`(${afterCursor} or ${storedSince})`
      : afterCursor;

  const rows = await db
    .select()
    .from(ranked)
    .where(unread ?? undefined)
    .orderBy(
      asc(ranked.band),
      desc(ranked.score),
      asc(ranked.relevance),
      asc(ranked.id),
    )
    .limit(window)
    .offset(offset);

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
        sourceCredibility: readSourceCredibility(row.metadata),
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
    sourceCredibility: readSourceCredibility(row.metadata),
    cursor: catalogCursor(
      Number(row.band),
      Number(row.score),
      Number(row.relevance),
      row.id,
    ),
    catalogId: row.id,
  }));
}

function readSourceCredibility(
  metadata: Record<string, unknown>,
): SourceCredibility | undefined {
  const value = metadata.credibility;
  return ["academic", "institutional", "established", "independent"].includes(
    typeof value === "string" ? value : "",
  )
    ? (value as SourceCredibility)
    : undefined;
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
const mediaWikiInFlight = new Map<string, Promise<number>>();
/** One politeness queue per wiki host: they are separate services. */
const mediaWikiQueues = new Map<
  string,
  { queue: Promise<void>; nextAt: number }
>();
/**
 * Works requested per wiki, per window.
 *
 * Fifty is the most the MediaWiki search API will return to an ordinary client
 * in one request, and also the most titles its query API will describe at once,
 * so this is the largest window that costs two requests rather than four.
 *
 * It was twenty, which read as generous — four wikis at twenty is eighty
 * candidates for a page of sixteen. It is not, because candidates are not
 * results: a work only survives if it matches enough of the query, near-misses
 * collapse into each other, and a reader who has excluded a source loses that
 * source's whole share. Excluding Wikipedia used to take fifty-eight per cent of
 * the catalog with nothing to replace it, and the page came back with five
 * results and no way to ask for more.
 */
const MEDIAWIKI_PAGE_SIZE = 50;

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

/**
 * Gap between two requests to one wiki.
 *
 * Requests to a host are serialised, so this is also the floor on how long an
 * import takes: each window costs a search request and a describe request, and a
 * page that needs several windows pays the gap for every one of them. At 1100ms
 * a reader waiting for a thin page to fill waited eight seconds in gaps alone.
 *
 * Wikimedia asks anonymous clients to keep concurrency low rather than to leave
 * a particular gap; serialised requests at roughly three a second are well
 * inside that, and the API rate-limits by itself if it disagrees.
 */
const MEDIAWIKI_REQUEST_GAP_MS = 350;

/**
 * Wait for this host's turn.
 *
 * Per host rather than one shared queue: Wikibooks, Wikiversity, Wikisource and
 * Wikipedia are separate services, and making them queue behind each other would
 * multiply the time an import takes for no one's benefit.
 */
async function waitForMediaWikiSlot(host: string) {
  const state = mediaWikiQueues.get(host) ?? {
    queue: Promise.resolve(),
    nextAt: 0,
  };
  mediaWikiQueues.set(host, state);
  let release = () => {};
  const previous = state.queue;
  state.queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const waitMs = Math.max(0, state.nextAt - Date.now());
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  state.nextAt = Date.now() + MEDIAWIKI_REQUEST_GAP_MS;
  release();
}

/**
 * Providers that have just failed, and when to try them again.
 *
 * A provider that is down still costs its full timeout, and a thin page asks
 * several times — so one unreachable service added its timeout to every round of
 * every search. Open Library being unreachable was seven seconds a round, paid by
 * a reader who would not have noticed its absence.
 */
const PROVIDER_COOLDOWN_MS = 60_000;
const providerCooldowns = new Map<string, number>();

export function providerIsResting(provider: string): boolean {
  const until = providerCooldowns.get(provider);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  providerCooldowns.delete(provider);
  return false;
}

export function restProvider(provider: string) {
  providerCooldowns.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
}

/** Test seam: forget every cooldown. */
export function clearProviderCooldowns() {
  providerCooldowns.clear();
}

/** Record the outcome of one provider sync. */
async function recordCatalogSync(
  provider: string,
  attemptedAt: string,
  itemCount: number,
  error?: string,
) {
  const succeededAt = error ? null : new Date().toISOString();
  await db
    .insert(catalogSyncStateTable)
    .values({
      provider,
      lastAttemptedAt: attemptedAt,
      ...(succeededAt ? { lastSuccessfulAt: succeededAt } : {}),
      itemCount,
      error: error ?? null,
    })
    .onConflictDoUpdate({
      target: catalogSyncStateTable.provider,
      set: {
        lastAttemptedAt: attemptedAt,
        ...(succeededAt ? { lastSuccessfulAt: succeededAt } : {}),
        itemCount,
        error: error ?? null,
      },
    });
}

function catalogUserAgent() {
  return process.env.CATALOG_CONTACT_EMAIL
    ? `Casparel/1.0 (${process.env.CATALOG_CONTACT_EMAIL})`
    // The point of a contact URL is that somebody at DOAJ or arXiv can reach
    // us about rate limits or misuse. This one 404s: the repository is
    // `casparel`, and was renamed out from under it.
    : "Casparel/1.0 (https://github.com/springdev28/casparel)";
}

/**
 * How far into a provider's own result set a top-up for this page should read.
 *
 * Without this every page asked Open Library and Wikibooks for their first
 * results again, so "Search more resources" could only ever re-store what the
 * catalog already had. Depth is capped because a client controls `page` and
 * deep offsets are expensive for the upstream services; past the cap the
 * stored catalog is the only source and the app says so.
 */
const REMOTE_PAGE_LIMIT = 8;

function remoteWindowOffset(options: CatalogSearchOptions, windowSize: number) {
  const page = Math.max(1, Math.min(REMOTE_PAGE_LIMIT, options.page ?? 1));
  return (page - 1) * windowSize;
}

export async function searchOpenLibraryAndStore(options: CatalogSearchOptions) {
  if (process.env.CATALOG_REMOTE_SEARCH_ENABLED === "false") return 0;
  // A provider that just failed is not asked again for a minute. It would cost
  // its whole timeout, once per round, on a page the reader is waiting for.
  if (providerIsResting("open-library")) return 0;
  // Open Library holds book records and nothing else.
  if (options.material && options.material !== "book") return 0;
  const query = [
    meaningfulSearchTerms(options.query).join(" "),
    options.subject,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (query.length < 2) return 0;
  if ((options.page ?? 1) > REMOTE_PAGE_LIMIT) return 0;
  const offset = remoteWindowOffset(options, 20);
  const key = `${query.toLowerCase()}:${options.language ?? "en"}:${offset}`;
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
      if (offset) endpoint.searchParams.set("offset", String(offset));
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
              material: "book",
              accessType: "free",
              credibility: "established",
              contentScope: "whole-work",
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
      restProvider("open-library");
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

type MediaWikiPage = {
  pageid?: number;
  title?: string;
  extract?: string;
  fullurl?: string;
  categories?: { title?: string }[];
  thumbnail?: { source?: string };
  pageprops?: { disambiguation?: string };
};

type MediaWikiPayload = {
  error?: { info?: string };
  query?: { pages?: MediaWikiPage[] };
};

async function mediaWikiRequest(
  host: string,
  params: Record<string, string>,
): Promise<MediaWikiPage[]> {
  const endpoint = new URL(`https://${host}/w/api.php`);
  for (const [name, value] of Object.entries({
    action: "query",
    format: "json",
    formatversion: "2",
    maxlag: "2",
    ...params,
  }))
    endpoint.searchParams.set(name, value);

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(9000),
    headers: { Accept: "application/json", "User-Agent": catalogUserAgent() },
  });
  if (!response.ok) throw new Error(`${host} returned ${response.status}`);
  const payload = (await response.json()) as MediaWikiPayload;
  if (payload.error) throw new Error(payload.error.info ?? `${host} API error`);
  return payload.query?.pages ?? [];
}

/**
 * Import open educational works from one MediaWiki site.
 *
 * Two requests, and the second is the one that matters. The search generator
 * returns whatever page happened to match — usually a chapter, sometimes a
 * print version, occasionally a shelf index — so its titles are rolled up to
 * the work and looked up again. That second call is where the real title,
 * description, subject and cover come from: the wiki's own answer about the
 * book, rather than an assumption made from the search that found it.
 */
export async function searchMediaWikiAndStore(
  site: MediaWikiSite,
  options: CatalogSearchOptions,
): Promise<number> {
  if (process.env.CATALOG_REMOTE_SEARCH_ENABLED === "false") return 0;
  const query = wikiSearchQuery(options.query, options.subject);
  if (query.length < 2) return 0;
  if ((options.page ?? 1) > REMOTE_PAGE_LIMIT) return 0;

  const language = siteLanguage(site, options.language);
  const host = siteHost(site, language);
  if (providerIsResting(host)) return 0;
  const offset = remoteWindowOffset(options, MEDIAWIKI_PAGE_SIZE);
  const key = `${host}:${query.toLowerCase()}:${offset}`;
  const existing = mediaWikiInFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const attemptedAt = new Date().toISOString();
    const syncProvider = `${site.provider} (${language})`;
    try {
      const remainingCapacity = Math.max(
        0,
        catalogItemLimit() - (await currentCatalogSize()),
      );
      if (!remainingCapacity) return 0;

      await waitForMediaWikiSlot(host);
      const found = await mediaWikiRequest(host, {
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "0",
        gsrlimit: String(MEDIAWIKI_PAGE_SIZE),
        ...(offset ? { gsroffset: String(offset) } : {}),
        prop: "info",
        inprop: "url",
      });

      // Roll chapters up to their work and drop shelves, indexes and print
      // versions, then keep the order the wiki ranked them in.
      const works: string[] = [];
      for (const page of found) {
        if (!page.title) continue;
        const work = workTitle(page.title, site.rollUpSubpages);
        if (!work || !isWorkTitle(work)) continue;
        if (!works.some((seen) => seen.toLowerCase() === work.toLowerCase()))
          works.push(work);
      }
      if (!works.length) {
        await recordCatalogSync(syncProvider, attemptedAt, 0);
        return 0;
      }

      await waitForMediaWikiSlot(host);
      const described = await mediaWikiRequest(host, {
        titles: works.slice(0, MEDIAWIKI_PAGE_SIZE).join("|"),
        prop: "extracts|categories|info|pageimages|pageprops",
        exintro: "1",
        explaintext: "1",
        // More prose per work: the description is both what a reader reads
        // and what the search matches on, so a three-sentence stub made
        // genuinely relevant works fail to match their own topic.
        exsentences: "6",
        cllimit: "max",
        clshow: "!hidden",
        piprop: "thumbnail",
        pithumbsize: "480",
        ppprop: "disambiguation",
        inprop: "url",
      });

      const now = new Date().toISOString();
      const items = described
        .filter(
          (page): page is MediaWikiPage & { title: string; fullurl: string } =>
            Boolean(page.title) &&
            Boolean(page.fullurl) &&
            Number.isInteger(page.pageid) &&
            isWorkTitle(page.title!) &&
            // A disambiguation page is a list of links, not something to
            // study, and the wiki says so itself.
            page.pageprops?.disambiguation === undefined,
        )
        .slice(0, Math.min(MEDIAWIKI_PAGE_SIZE, remainingCapacity))
        .map((page): InsertCatalogResource => {
          const categories = (page.categories ?? [])
            .map((category) => category.title ?? "")
            .filter(Boolean);
          const subject = subjectFromCategories(categories);
          const extract = page.extract?.replace(/\s+/g, " ").trim();
          return {
            provider: site.provider,
            providerUrl: `https://${host}/`,
            externalId: `${language}:${page.title.toLocaleLowerCase()}`,
            canonicalUrl: canonicalCatalogUrl(page.fullurl),
            title: page.title,
            description:
              extract && extract.length > 20
                ? extract.slice(0, 600)
                : `An open educational work from ${host}.`,
            format: site.format,
            // Never options.subject and never a word from the query: those
            // describe the search, not the work.
            subject: (subject ?? "Interdisciplinary").slice(0, 160),
            gradeLevel: "All levels",
            language,
            license: site.license,
            author: `${site.provider} contributors`,
            thumbnailUrl: page.thumbnail?.source ?? null,
            publishedAt: null,
            sourceKind: site.sourceKind,
            metadata: {
              accessType: "free",
              credibility: "established",
              contentScope: "whole-work",
              material: site.material,
              pageId: page.pageid,
              categories: categories.slice(0, 12),
            },
            lastSyncedAt: now,
          };
        });

      const count = await upsertCatalogResources(items);
      await recordCatalogSync(syncProvider, attemptedAt, count);
      return count;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      restProvider(host);
      await recordCatalogSync(syncProvider, attemptedAt, 0, message);
      return 0;
    } finally {
      mediaWikiInFlight.delete(key);
    }
  })();
  mediaWikiInFlight.set(key, task);
  return task;
}

/** Kept for callers and tests that name the original importer. */
export function searchWikibooksAndStore(options: CatalogSearchOptions) {
  return searchMediaWikiAndStore(MEDIAWIKI_SITES[0], options);
}

/**
 * Whether a reader who excluded a source would keep anything this site returns.
 *
 * Importing a source the reader has excluded is work whose entire result is then
 * filtered away. Wikipedia is the biggest of the wikis, so a reader who excluded
 * it lost the majority of every page and the import budget that could have
 * reached further into the sources they *did* want went on fetching rows nobody
 * would see.
 */
export function siteIsExcluded(
  site: MediaWikiSite,
  excludeSource: string | undefined,
): boolean {
  const needle = excludeSource?.trim().toLowerCase();
  if (!needle) return false;
  return (
    site.provider.toLowerCase().includes(needle) ||
    site.host.toLowerCase().includes(needle) ||
    site.sourceKind.includes(needle)
  );
}

/**
 * Whether asking this source could produce what the reader asked for.
 *
 * A reader who wants primary texts gets nothing from Wikipedia however deeply it
 * is read, and a reader who wants papers gets nothing from any of the wikis.
 * Reading them anyway spends the round's budget on rows the filter then removes
 * — the same waste as importing a source the reader has excluded.
 */
export function siteMatchesMaterial(
  site: MediaWikiSite,
  material: string | undefined,
): boolean {
  return !material || site.material === material;
}

/** Every wiki importer the reader has not excluded, run together. */
export async function searchOpenWikisAndStore(options: CatalogSearchOptions) {
  const wanted = MEDIAWIKI_SITES.filter(
    (site) =>
      !siteIsExcluded(site, options.excludeSource) &&
      siteMatchesMaterial(site, options.material),
  );
  const counts = await Promise.all(
    wanted.map((site) => searchMediaWikiAndStore(site, options).catch(() => 0)),
  );
  return counts.reduce((total, count) => total + count, 0);
}


// ── Open-access sources beyond the wikis ─────────────────────────────────────

/**
 * One queue per open source, so two services never wait on each other.
 *
 * Same shape as the wiki queues and for the same reason: these are independent
 * services, and serialising them all behind one queue would multiply the time a
 * thin page takes by the number of sources.
 */
const openSourceQueues = new Map<
  string,
  { queue: Promise<void>; nextAt: number }
>();
const OPEN_SOURCE_REQUEST_GAP_MS = 350;
const openSourceInFlight = new Map<string, Promise<number>>();

async function waitForOpenSourceSlot(host: string) {
  const state = openSourceQueues.get(host) ?? {
    queue: Promise.resolve(),
    nextAt: 0,
  };
  openSourceQueues.set(host, state);
  let release = () => {};
  const previous = state.queue;
  state.queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const waitMs = Math.max(0, state.nextAt - Date.now());
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  state.nextAt = Date.now() + OPEN_SOURCE_REQUEST_GAP_MS;
  release();
}

/**
 * Read one window of one open source and store what it holds.
 *
 * Everything general lives here — pacing, the cooldown after a failure,
 * collapsing concurrent identical requests, the catalog's size cap, recording
 * the outcome — and everything particular to a source lives in its own
 * description in openSources.ts. Adding the fourth and fifth source should be a
 * matter of saying how to ask and how to read the answer, not another copy of
 * this.
 */
/**
 * How long a source's follow-up request may take.
 *
 * Shorter than the search it follows, and deliberately so. The rows are
 * already usable; this only makes them better, and the top-up it runs inside
 * is bounded by a wall clock the reader is waiting on. A subject is not worth
 * a page arriving late for.
 */
const ENRICH_TIMEOUT_MS = 4000;

/**
 * A source's second request, if it has one and it works.
 *
 * Every failure returns the rows untouched: not found, rate-limited, timed
 * out, malformed. It does not rest the provider either — the search itself
 * succeeded, and taking a source offline for a minute because an optional
 * extra failed would trade something real for something incidental.
 */
async function enrichOpenSourceRows(
  source: OpenSource,
  rows: ParsedResource[],
): Promise<ParsedResource[]> {
  if (!source.enrich || !rows.length) return rows;
  const endpoint = source.enrich.endpoint(rows);
  if (!endpoint) return rows;
  try {
    await waitForOpenSourceSlot(source.host);
    source.onRequest?.("enrich");
    const response = await fetch(endpoint, {
      headers: { accept: "application/json", "user-agent": catalogUserAgent() },
      signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
    });
    if (!response.ok) return rows;
    return source.enrich.apply(rows, await response.json());
  } catch {
    return rows;
  }
}

export type VideoRefreshOptions = {
  /** How many videos one pass may ask about. */
  limit?: number;
  /**
   * Only videos not checked since this instant, which is what turns a
   * perpetual loop into a sweep with an end: pass the moment the process
   * started and each row drops out as it is checked.
   */
  checkedBefore?: string;
};

/**
 * What a pass did, and — the part the caller needs — whether it got to try.
 *
 * "Swept" with nothing examined means there is genuinely nothing left and the
 * caller can stop. Skipped and failed also examine nothing, and a caller that
 * could not tell them apart would stop sweeping the first time the key was
 * missing or a lookup timed out, and never start again.
 */
export type VideoRefresh = {
  status: "swept" | "skipped" | "failed";
  examined: number;
  corrected: number;
};

/**
 * Correct the subject on videos already stored.
 *
 * Classification only ever ran as a video was imported, so improving it fixed
 * nothing that was already in the catalog — and a row is only re-imported when
 * a search runs thin enough to ask the providers again. A question the catalog
 * already answers well never does that, so "History Summarized: The Punic Wars"
 * would have stayed filed under Literature for good: the search that shows it
 * is exactly the search that never re-imports it.
 *
 * The oldest-checked videos go first and are stamped as checked, so this walks
 * the whole catalog in a loop rather than worrying at the same rows. One
 * request per batch of fifty, one unit of the daily allowance, and it asks
 * through the same gate as everything else — no key or no allowance left means
 * it simply does not run.
 *
 * A video whose classification now comes to nothing is reset rather than left:
 * the new answer is the authoritative one, including when the new answer is
 * that its own tags never said.
 */
export async function refreshStoredVideoSubjects({
  limit = YOUTUBE_LOOKUP_BATCH,
  checkedBefore,
}: VideoRefreshOptions = {}): Promise<VideoRefresh> {
  if (process.env.CATALOG_REMOTE_SEARCH_ENABLED === "false")
    return { status: "skipped", examined: 0, corrected: 0 };
  const source = OPEN_SOURCES.find((candidate) => candidate.kind === "youtube");
  if (!source || (source.available && !source.available()))
    return { status: "skipped", examined: 0, corrected: 0 };

  const stored = await db
    .select({
      id: catalogResourcesTable.id,
      externalId: catalogResourcesTable.externalId,
      subject: catalogResourcesTable.subject,
    })
    .from(catalogResourcesTable)
    .where(
      checkedBefore
        ? and(
            eq(catalogResourcesTable.sourceKind, "youtube"),
            sql`${catalogResourcesTable.lastSyncedAt} < ${checkedBefore}`,
          )
        : eq(catalogResourcesTable.sourceKind, "youtube"),
    )
    .orderBy(asc(catalogResourcesTable.lastSyncedAt))
    .limit(Math.max(1, Math.min(YOUTUBE_LOOKUP_BATCH, limit)));
  // Nothing left that predates the mark: the sweep is finished, and the caller
  // reads this as its cue to stop rather than keep asking.
  if (!stored.length) return { status: "swept", examined: 0, corrected: 0 };

  const endpoint = youtubeLookupUrl(stored.map((row) => row.externalId));
  if (!endpoint) return { status: "skipped", examined: 0, corrected: 0 };

  let subjects: Map<string, string>;
  try {
    await waitForOpenSourceSlot(source.host);
    source.onRequest?.("enrich");
    const response = await fetch(endpoint, {
      headers: { accept: "application/json", "user-agent": catalogUserAgent() },
      signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
    });
    if (!response.ok)
      return { status: "failed", examined: 0, corrected: 0 };
    subjects = youtubeSubjectsFrom(await response.json());
  } catch {
    // Nothing was corrected, and nothing was broken. The next pass tries again,
    // and says so, or a sweep would end on the first flaky minute.
    return { status: "failed", examined: 0, corrected: 0 };
  }

  const now = new Date().toISOString();
  let corrected = 0;
  for (const row of stored) {
    const subject = subjects.get(row.externalId) ?? "Interdisciplinary";
    // Stamped as checked either way, or the same fifty rows are asked about
    // forever and the rest of the catalog is never reached.
    await db
      .update(catalogResourcesTable)
      .set(
        subject === row.subject
          ? { lastSyncedAt: now }
          : { subject, lastSyncedAt: now },
      )
      .where(eq(catalogResourcesTable.id, row.id));
    if (subject !== row.subject) corrected += 1;
  }
  return { status: "swept", examined: stored.length, corrected };
}

export async function searchOpenSourceAndStore(
  source: OpenSource,
  options: CatalogSearchOptions,
): Promise<number> {
  if (process.env.CATALOG_REMOTE_SEARCH_ENABLED === "false") return 0;
  if (providerIsResting(source.kind)) return 0;
  // A source needing a key that is not configured is skipped rather than asked
  // and failing: an unconfigured source is not an outage.
  if (source.available && !source.available()) return 0;
  const query = meaningfulSearchTerms(options.query).join(" ");
  if (query.length < 2) return 0;
  if ((options.page ?? 1) > REMOTE_PAGE_LIMIT) return 0;

  const offset = remoteWindowOffset(options, source.pageSize);
  const key = `${source.kind}:${query.toLowerCase()}:${offset}`;
  const existing = openSourceInFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const attemptedAt = new Date().toISOString();
    try {
      const remainingCapacity = Math.max(
        0,
        catalogItemLimit() - (await currentCatalogSize()),
      );
      if (!remainingCapacity) return 0;

      await waitForOpenSourceSlot(source.host);
      // Counted as spent before it is sent, not after it succeeds: a request
      // that times out or comes back 500 has still been charged for.
      source.onRequest?.("search");
      const response = await fetch(
        source.endpoint(query, offset, source.pageSize),
        {
          headers: {
            accept:
              source.responseType === "text"
                ? "application/atom+xml, application/xml, text/xml"
                : "application/json",
            // Who is asking, and where to complain. OpenAlex and Crossref both
            // give an identified client better rate limits for it, and it is
            // simple courtesy to a service nobody is charging us for.
            "user-agent": catalogUserAgent(),
          },
          // A source that cannot answer in time is not worth a reader waiting
          // for: there are eleven others, and the page is topped up again on the
          // next search anyway. A source may ask for longer if it is slow and
          // worth it.
          signal: AbortSignal.timeout(source.timeoutMs ?? 6000),
        },
      );
      if (!response.ok)
        throw new Error(`${source.provider} returned ${response.status}`);
      const parsed = await enrichOpenSourceRows(
        source,
        source.parse(
          source.responseType === "text"
            ? await response.text()
            : await response.json(),
        ),
      );

      const now = new Date().toISOString();
      const items: InsertCatalogResource[] = parsed
        .slice(0, Math.min(source.pageSize, remainingCapacity))
        .map((row) => ({
          provider: source.provider,
          providerUrl: source.providerUrl,
          externalId: row.externalId,
          canonicalUrl: canonicalCatalogUrl(row.url),
          title: row.title,
          description: row.description,
          format: row.format,
          // Never the query and never the reader's filters: those describe the
          // search, not the work. "Interdisciplinary" is the honest answer when
          // the source's own classification named nothing the catalog knows.
          subject: (row.subject ?? "Interdisciplinary").slice(0, 160),
          gradeLevel: source.material === "paper" ? "Higher education" : "All levels",
          language: row.language ?? "en",
          license: row.license ?? null,
          author: row.author ?? null,
          thumbnailUrl: row.thumbnailUrl ?? null,
          publishedAt: row.publishedAt ?? null,
          sourceKind: source.kind,
          metadata: {
            accessType: "free",
            credibility: source.material === "paper" ? "academic" : "institutional",
            contentScope: "whole-work",
            material: source.material,
          },
          lastSyncedAt: now,
        }));

      const count = await upsertCatalogResources(items);
      await recordCatalogSync(source.provider, attemptedAt, count);
      return count;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      restProvider(source.kind);
      await recordCatalogSync(source.provider, attemptedAt, 0, message);
      return 0;
    } finally {
      openSourceInFlight.delete(key);
    }
  })();
  openSourceInFlight.set(key, task);
  return task;
}

/** Every open source the reader has not excluded, read together. */
export async function searchOpenSourcesAndStore(
  options: CatalogSearchOptions,
): Promise<number> {
  const wanted = OPEN_SOURCES.filter(
    (source) =>
      !openSourceIsExcluded(source, options.excludeSource) &&
      (!options.material || source.material === options.material),
  );
  const counts = await Promise.all(
    wanted.map((source) =>
      searchOpenSourceAndStore(source, options).catch(() => 0),
    ),
  );
  return counts.reduce((total, count) => total + count, 0);
}
