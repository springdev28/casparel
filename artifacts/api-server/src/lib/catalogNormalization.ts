import { meaningfulSearchTerms } from "./searchTerms";

export const CANONICAL_SUBJECTS = [
  "arts",
  "biology",
  "business-economics",
  "chemistry",
  "computer-science",
  "earth-space-science",
  "engineering",
  "geography",
  "general-science",
  "history",
  "interdisciplinary",
  "literature",
  "mathematics",
  "medicine-health",
  "philosophy",
  "physics",
  "social-science",
  "writing-language-arts",
  "other",
] as const;

export const CANONICAL_GRADE_BANDS = [
  "elementary-school",
  "middle-school",
  "high-school",
  "higher-education",
  "adult-learning",
  "all-levels",
  "unknown",
] as const;

export const CANONICAL_FORMATS = [
  "article",
  "video",
  "pdf",
  "podcast",
  "interactive",
  "other",
] as const;

export const CANONICAL_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
  "mixed",
  "unknown",
] as const;

export type CanonicalSubject = (typeof CANONICAL_SUBJECTS)[number];
export type CanonicalGradeBand = (typeof CANONICAL_GRADE_BANDS)[number];
export type CanonicalFormat = (typeof CANONICAL_FORMATS)[number];
export type CanonicalDifficulty = (typeof CANONICAL_DIFFICULTIES)[number];

export type NormalizedResourceMetadata = {
  subjects: string[];
  courses: string[];
  gradeBands: string[];
  formats: string[];
  languages: string[];
  difficulties: string[];
  providers: string[];
  licenses: string[];
  accessTypes: string[];
};

export type NormalizableResource = {
  title?: string | null;
  url?: string | null;
  description?: string | null;
  format?: string | null;
  source?: string | null;
  provider?: string | null;
  subject?: string | null;
  course?: string | null;
  gradeLevel?: string | null;
  language?: string | null;
  difficulty?: string | null;
  license?: string | null;
  accessType?: string | null;
  normalizedMetadata?: NormalizedResourceMetadata | null;
};

export type NormalizedResourceFilters = {
  query?: string;
  format?: string;
  subject?: string;
  course?: string;
  gradeLevel?: string;
  language?: string;
  difficulty?: string;
  source?: string;
  license?: string;
  accessType?: string;
  exactPhrase?: string;
  excludedWords?: string;
};

export type CatalogMetadataFacet =
  | "subjects"
  | "courses"
  | "gradeBands"
  | "formats"
  | "languages"
  | "difficulties"
  | "providers"
  | "licenses"
  | "accessTypes";

export type ExpandedCatalogFacet = {
  canonical: string[];
  aliases: string[];
};

type Aliases<T extends string> = ReadonlyArray<{
  canonical: T;
  aliases: readonly string[];
}>;

const SUBJECT_ALIASES: Aliases<CanonicalSubject> = [
  {
    canonical: "physics",
    aliases: [
      "physics",
      "physical science",
      "physical sciences",
      "mechanics",
      "electricity and magnetism",
      "electricity & magnetism",
      "e&m",
      "e and m",
      "electromagnetism",
      "electrodynamics",
      "quantum mechanics",
      "thermodynamics",
      "astrophysics",
    ],
  },
  {
    canonical: "mathematics",
    aliases: [
      "mathematics",
      "math",
      "maths",
      "algebra",
      "geometry",
      "calculus",
      "trigonometry",
      "statistics",
      "probability",
      "linear algebra",
      "precalculus",
    ],
  },
  {
    canonical: "chemistry",
    aliases: [
      "chemistry",
      "chemical science",
      "organic chemistry",
      "inorganic chemistry",
      "biochemistry",
    ],
  },
  {
    canonical: "biology",
    aliases: [
      "biology",
      "life science",
      "ecology",
      "genetics",
      "microbiology",
      "molecular biology",
      "anatomy",
      "physiology",
    ],
  },
  {
    canonical: "computer-science",
    aliases: [
      "computer science",
      "computing",
      "programming",
      "coding",
      "software engineering",
      "web development",
      "data science",
      "machine learning",
      "artificial intelligence",
    ],
  },
  {
    canonical: "history",
    aliases: [
      "history",
      "world history",
      "us history",
      "american history",
      "european history",
      "ancient history",
    ],
  },
  {
    canonical: "literature",
    aliases: ["literature", "english literature", "comparative literature"],
  },
  {
    canonical: "writing-language-arts",
    aliases: [
      "writing",
      "language arts",
      "english language arts",
      "ela",
      "composition",
      "grammar",
      "rhetoric",
    ],
  },
  {
    canonical: "earth-space-science",
    aliases: [
      "earth science",
      "space science",
      "earth and space science",
      "astronomy",
      "geology",
      "meteorology",
      "oceanography",
    ],
  },
  {
    canonical: "engineering",
    aliases: [
      "engineering",
      "electrical engineering",
      "mechanical engineering",
      "civil engineering",
      "chemical engineering",
      "stem engineering",
    ],
  },
  {
    canonical: "general-science",
    aliases: ["science", "natural science", "natural sciences", "stem"],
  },
  {
    canonical: "social-science",
    aliases: [
      "social science",
      "sociology",
      "psychology",
      "political science",
      "anthropology",
      "civics",
    ],
  },
  {
    canonical: "business-economics",
    aliases: [
      "business",
      "economics",
      "economy",
      "finance",
      "accounting",
      "management",
      "marketing",
    ],
  },
  {
    canonical: "medicine-health",
    aliases: [
      "medicine",
      "medical science",
      "health",
      "health science",
      "public health",
      "nursing",
    ],
  },
  {
    canonical: "geography",
    aliases: ["geography", "human geography", "physical geography"],
  },
  {
    canonical: "philosophy",
    aliases: ["philosophy", "ethics", "logic"],
  },
  {
    canonical: "arts",
    aliases: [
      "arts",
      "visual art",
      "art history",
      "music",
      "theatre",
      "theater",
      "dance",
      "design",
    ],
  },
  {
    canonical: "interdisciplinary",
    aliases: [
      "interdisciplinary",
      "multidisciplinary",
      "general education",
      "all subjects",
    ],
  },
];

const COURSE_ALIASES: Aliases<string> = [
  {
    canonical: "ap-physics-c-electricity-and-magnetism",
    aliases: [
      "ap physics c electricity and magnetism",
      "ap physics c: electricity and magnetism",
      "ap physics c e&m",
      "ap physics c e and m",
      "ap physics c em",
      "electricity and magnetism",
      "electricity magnetism",
      "electromagnetism",
    ],
  },
  {
    canonical: "ap-physics-c-mechanics",
    aliases: ["ap physics c mechanics", "physics c mechanics"],
  },
  {
    canonical: "ap-physics-c",
    aliases: ["ap physics c", "advanced placement physics c"],
  },
  {
    canonical: "ap-physics-1",
    aliases: ["ap physics 1", "advanced placement physics 1"],
  },
  {
    canonical: "ap-physics-2",
    aliases: ["ap physics 2", "advanced placement physics 2"],
  },
  {
    canonical: "ap-calculus-ab",
    aliases: ["ap calculus ab", "advanced placement calculus ab"],
  },
  {
    canonical: "ap-calculus-bc",
    aliases: ["ap calculus bc", "advanced placement calculus bc"],
  },
  {
    canonical: "ap-biology",
    aliases: ["ap biology", "advanced placement biology"],
  },
  {
    canonical: "ap-chemistry",
    aliases: ["ap chemistry", "advanced placement chemistry"],
  },
  {
    canonical: "ap-computer-science-a",
    aliases: ["ap computer science a", "ap csa"],
  },
  {
    canonical: "ap-computer-science-principles",
    aliases: ["ap computer science principles", "ap csp"],
  },
  {
    canonical: "algebra-1",
    aliases: ["algebra 1", "algebra i", "elementary algebra"],
  },
  {
    canonical: "algebra-2",
    aliases: ["algebra 2", "algebra ii", "intermediate algebra"],
  },
  { canonical: "geometry", aliases: ["geometry", "euclidean geometry"] },
  {
    canonical: "precalculus",
    aliases: ["precalculus", "pre calculus", "college algebra"],
  },
  {
    canonical: "calculus",
    aliases: ["calculus", "calculus i", "calculus 1"],
  },
  { canonical: "linear-algebra", aliases: ["linear algebra"] },
  { canonical: "organic-chemistry", aliases: ["organic chemistry"] },
  { canonical: "general-biology", aliases: ["general biology", "biology 1"] },
  {
    canonical: "world-history",
    aliases: ["world history", "ap world history"],
  },
  { canonical: "us-history", aliases: ["us history", "american history"] },
  {
    canonical: "english-composition",
    aliases: ["english composition", "academic writing", "first year writing"],
  },
];

const COURSE_SUBJECTS: Record<string, CanonicalSubject> = {
  "ap-physics-c-electricity-and-magnetism": "physics",
  "ap-physics-c-mechanics": "physics",
  "ap-physics-c": "physics",
  "ap-physics-1": "physics",
  "ap-physics-2": "physics",
  "ap-calculus-ab": "mathematics",
  "ap-calculus-bc": "mathematics",
  "algebra-1": "mathematics",
  "algebra-2": "mathematics",
  geometry: "mathematics",
  precalculus: "mathematics",
  calculus: "mathematics",
  "linear-algebra": "mathematics",
  "ap-biology": "biology",
  "general-biology": "biology",
  "ap-chemistry": "chemistry",
  "organic-chemistry": "chemistry",
  "ap-computer-science-a": "computer-science",
  "ap-computer-science-principles": "computer-science",
  "world-history": "history",
  "us-history": "history",
  "english-composition": "writing-language-arts",
};

const GRADE_ALIASES: Aliases<CanonicalGradeBand> = [
  {
    canonical: "elementary-school",
    aliases: [
      "elementary school",
      "primary school",
      "primary education",
      "kindergarten",
      "k 5",
      "grades k 5",
      "grades 1 5",
    ],
  },
  {
    canonical: "middle-school",
    aliases: [
      "middle school",
      "lower secondary",
      "junior high",
      "grades 6 8",
      "6 8",
      "secondary education",
    ],
  },
  {
    canonical: "high-school",
    aliases: [
      "high school",
      "upper secondary",
      "secondary school",
      "secondary education",
      "grades 9 12",
      "9 12",
      "advanced placement",
      "ap course",
    ],
  },
  {
    canonical: "higher-education",
    aliases: [
      "higher education",
      "college",
      "university",
      "undergraduate",
      "graduate school",
      "postsecondary",
      "tertiary education",
    ],
  },
  {
    canonical: "adult-learning",
    aliases: ["adult", "adult learning", "professional development"],
  },
  {
    canonical: "all-levels",
    aliases: [
      "all levels",
      "all ages",
      "all grades",
      "any grade",
      "k 12 and higher education",
    ],
  },
];

const FORMAT_ALIASES: Aliases<CanonicalFormat> = [
  {
    canonical: "article",
    aliases: [
      "article",
      "web article",
      "blog post",
      "guide",
      "web page",
      "html",
    ],
  },
  {
    canonical: "video",
    aliases: ["video", "lecture video", "recording", "youtube", "film"],
  },
  {
    canonical: "pdf",
    aliases: [
      "pdf",
      "pdf document",
      "document",
      "ebook",
      "e book",
      "downloadable book",
    ],
  },
  {
    canonical: "podcast",
    aliases: ["podcast", "audio", "audio lesson", "episode"],
  },
  {
    canonical: "interactive",
    aliases: [
      "interactive",
      "simulation",
      "simulator",
      "interactive lab",
      "learning app",
    ],
  },
  { canonical: "other", aliases: ["other", "mixed media", "website"] },
];

const LANGUAGE_ALIASES: Aliases<string> = [
  { canonical: "en", aliases: ["en", "en us", "en gb", "english"] },
  { canonical: "es", aliases: ["es", "espanol", "spanish", "castilian"] },
  { canonical: "fr", aliases: ["fr", "francais", "french"] },
  { canonical: "de", aliases: ["de", "deutsch", "german"] },
  { canonical: "pt", aliases: ["pt", "pt br", "portugues", "portuguese"] },
  { canonical: "tr", aliases: ["tr", "turkce", "turkish"] },
  { canonical: "ar", aliases: ["ar", "arabic"] },
  { canonical: "zh", aliases: ["zh", "chinese", "mandarin"] },
  { canonical: "ja", aliases: ["ja", "japanese"] },
  { canonical: "ko", aliases: ["ko", "korean"] },
  { canonical: "hi", aliases: ["hi", "hindi"] },
  { canonical: "ru", aliases: ["ru", "russian"] },
  { canonical: "it", aliases: ["it", "italian"] },
  {
    canonical: "multilingual",
    aliases: ["multilingual", "multiple languages", "many languages"],
  },
  { canonical: "other", aliases: ["other", "unknown"] },
];

const DIFFICULTY_ALIASES: Aliases<CanonicalDifficulty> = [
  {
    canonical: "beginner",
    aliases: [
      "beginner",
      "introductory",
      "introduction",
      "fundamentals",
      "basic",
      "novice",
    ],
  },
  {
    canonical: "intermediate",
    aliases: ["intermediate", "developing", "level 2"],
  },
  {
    canonical: "advanced",
    aliases: [
      "advanced",
      "advanced placement",
      "ap course",
      "graduate level",
      "expert",
    ],
  },
  {
    canonical: "mixed",
    aliases: ["mixed", "all levels", "multiple levels", "beginner to advanced"],
  },
  { canonical: "unknown", aliases: ["unknown", "unspecified"] },
];

const PROVIDER_ALIASES: Aliases<string> = [
  { canonical: "khan-academy", aliases: ["khan academy", "khanacademy org"] },
  {
    canonical: "mit-opencourseware",
    aliases: [
      "mit opencourseware",
      "mit ocw",
      "open course ware mit",
      "ocw mit edu",
    ],
  },
  { canonical: "openstax", aliases: ["openstax", "openstax org"] },
  {
    canonical: "phet-interactive-simulations",
    aliases: ["phet", "phet interactive simulations", "phet colorado edu"],
  },
  { canonical: "open-library", aliases: ["open library", "openlibrary org"] },
  { canonical: "wikibooks", aliases: ["wikibooks", "wikibooks org"] },
  { canonical: "oer-commons", aliases: ["oer commons", "oercommons org"] },
  { canonical: "coursera", aliases: ["coursera", "coursera org"] },
  { canonical: "edx", aliases: ["edx", "edx org"] },
  { canonical: "youtube", aliases: ["youtube", "youtube com", "youtu be"] },
  {
    canonical: "library-of-congress",
    aliases: ["library of congress", "loc gov"],
  },
  { canonical: "nasa", aliases: ["nasa", "nasa gov"] },
  {
    canonical: "project-gutenberg",
    aliases: ["project gutenberg", "gutenberg org"],
  },
  { canonical: "ted-ed", aliases: ["ted ed", "ed ted com"] },
  { canonical: "ck-12", aliases: ["ck 12", "ck12", "ck12 org"] },
  { canonical: "merlot", aliases: ["merlot", "merlot org"] },
];

const LICENSE_ALIASES: Aliases<string> = [
  { canonical: "cc0", aliases: ["cc0", "cc zero", "creative commons zero"] },
  {
    canonical: "cc-by-nc-sa",
    aliases: [
      "cc by nc sa",
      "creative commons attribution noncommercial sharealike",
    ],
  },
  {
    canonical: "cc-by-nc-nd",
    aliases: [
      "cc by nc nd",
      "creative commons attribution noncommercial noderivatives",
    ],
  },
  {
    canonical: "cc-by-sa",
    aliases: ["cc by sa", "creative commons attribution sharealike"],
  },
  {
    canonical: "cc-by-nc",
    aliases: ["cc by nc", "creative commons attribution noncommercial"],
  },
  {
    canonical: "cc-by-nd",
    aliases: ["cc by nd", "creative commons attribution noderivatives"],
  },
  { canonical: "cc-by", aliases: ["cc by", "creative commons attribution"] },
  { canonical: "public-domain", aliases: ["public domain", "government work"] },
  { canonical: "mit-license", aliases: ["mit license"] },
  { canonical: "apache-license", aliases: ["apache license"] },
  { canonical: "gpl", aliases: ["gpl", "gnu general public license"] },
  {
    canonical: "open-license-varies",
    aliases: [
      "open licenses vary",
      "open license varies",
      "item licenses vary",
      "course licenses vary",
    ],
  },
  {
    canonical: "provider-terms",
    aliases: [
      "provider terms",
      "site terms",
      "youtube terms",
      "ted terms",
      "free to access",
    ],
  },
  {
    canonical: "rights-vary",
    aliases: ["rights vary", "resource rights vary", "check local law"],
  },
  { canonical: "copyright", aliases: ["copyright", "all rights reserved"] },
];

export const CANONICAL_COURSES = [
  "general",
  ...new Set(COURSE_ALIASES.map((entry) => entry.canonical)),
] as readonly string[];

export const CANONICAL_LANGUAGES = [
  ...new Set(LANGUAGE_ALIASES.map((entry) => entry.canonical)),
] as readonly string[];

export const CANONICAL_PROVIDERS = [
  "unknown",
  ...new Set(PROVIDER_ALIASES.map((entry) => entry.canonical)),
] as readonly string[];

export const CANONICAL_LICENSES = [
  "unknown",
  ...new Set(LICENSE_ALIASES.map((entry) => entry.canonical)),
] as readonly string[];

const REUSABLE_LICENSES = new Set([
  "cc0",
  "cc-by",
  "cc-by-sa",
  "cc-by-nc",
  "cc-by-nc-sa",
  "public-domain",
  "mit-license",
  "apache-license",
  "gpl",
]);

function expandCommonAbbreviations(value: string) {
  return value
    .replace(/\be\s*[&/]\s*m\b/gi, " electricity and magnetism ")
    .replace(/\be\s+and\s+m\b/gi, " electricity and magnetism ")
    .replace(/\bocw\b/gi, " mit opencourseware ")
    .replace(/\bhs\b/gi, " high school ")
    .replace(/\bms\b/gi, " middle school ");
}

export function foldCatalogText(value: string | null | undefined) {
  return expandCommonAbbreviations(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAlias(text: string, alias: string) {
  const normalizedAlias = foldCatalogText(alias);
  return (
    Boolean(normalizedAlias) && ` ${text} `.includes(` ${normalizedAlias} `)
  );
}

function canonicalValues<T extends string>(text: string, aliases: Aliases<T>) {
  return aliases
    .filter((entry) =>
      entry.aliases.some((alias) => containsAlias(text, alias)),
    )
    .map((entry) => entry.canonical);
}

function unique(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))];
}

function canonicalSubjects(text: string) {
  return canonicalValues(text, SUBJECT_ALIASES);
}

function canonicalCourses(text: string) {
  const courses = canonicalValues(text, COURSE_ALIASES);
  if (
    courses.some((course) => course.startsWith("ap-physics-c-")) &&
    !courses.includes("ap-physics-c")
  )
    courses.push("ap-physics-c");
  return unique(courses);
}

function canonicalGradeBands(text: string) {
  const values = canonicalValues(text, GRADE_ALIASES);
  const gradeMatches = [
    ...text.matchAll(/\bgrades?\s*(\d{1,2})\b/g),
    ...text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+grades?\b/g),
  ];
  for (const match of gradeMatches) {
    const grade = Number(match[1]);
    if (grade >= 1 && grade <= 5) values.push("elementary-school");
    if (grade >= 6 && grade <= 8) values.push("middle-school");
    if (grade >= 9 && grade <= 12) values.push("high-school");
  }
  if (
    /\bap(?:\s+[a-z]|\s*course|\s*physics|\s*biology|\s*chemistry|\s*calculus|\s*history)/.test(
      text,
    )
  )
    values.push("high-school");
  return unique(values);
}

function canonicalFormats(text: string) {
  return canonicalValues(text, FORMAT_ALIASES);
}

function canonicalLanguages(text: string, url?: string | null) {
  const direct = canonicalValues(text, LANGUAGE_ALIASES);
  if (direct.length) return unique(direct);
  try {
    const parsed = new URL(url ?? "");
    const subdomain = parsed.hostname.toLocaleLowerCase().split(".")[0];
    const fromHost = canonicalValues(
      foldCatalogText(subdomain),
      LANGUAGE_ALIASES,
    );
    if (fromHost.length) return unique(fromHost);
  } catch {
    // A missing or non-URL value has no reliable language signal.
  }
  return [];
}

function canonicalDifficulties(text: string) {
  return canonicalValues(text, DIFFICULTY_ALIASES);
}

function hostnameWords(url: string | null | undefined) {
  try {
    return new URL(url ?? "").hostname
      .replace(/^(?:www\.|old\.)/, "")
      .replace(/\./g, " ");
  } catch {
    return "";
  }
}

function slug(value: string) {
  return foldCatalogText(value).replace(/\s+/g, "-");
}

function canonicalProviders(
  provider: string | null | undefined,
  url: string | null | undefined,
) {
  const text = foldCatalogText(`${provider ?? ""} ${hostnameWords(url)}`);
  const known = canonicalValues(text, PROVIDER_ALIASES);
  if (known.length) return unique(known);
  const fallback = slug(provider ?? "") || slug(hostnameWords(url));
  return fallback ? [fallback] : ["unknown"];
}

function canonicalLicenses(text: string) {
  const known = canonicalValues(text, LICENSE_ALIASES);
  return known.length ? unique(known) : ["unknown"];
}

function canonicalAccessTypes(text: string) {
  if (
    containsAlias(text, "free account") ||
    containsAlias(text, "registration required")
  )
    return ["free-account"];
  if (
    containsAlias(text, "open") ||
    containsAlias(text, "free") ||
    containsAlias(text, "no account")
  )
    return ["open"];
  if (containsAlias(text, "paid") || containsAlias(text, "subscription"))
    return ["paid"];
  return ["unknown"];
}

function validStoredValues(
  metadata: NormalizedResourceMetadata | null | undefined,
  key: keyof NormalizedResourceMetadata,
) {
  const values = metadata?.[key];
  return Array.isArray(values)
    ? values.filter(
        (value): value is string => typeof value === "string" && Boolean(value),
      )
    : [];
}

export function normalizeResourceMetadata(
  item: NormalizableResource,
): NormalizedResourceMetadata {
  const provider = item.source ?? item.provider ?? "";
  const rawSubject = foldCatalogText(item.subject);
  const semanticText = foldCatalogText(
    `${item.title ?? ""} ${item.description ?? ""} ${item.subject ?? ""} ${item.course ?? ""}`,
  );
  const courses = unique([
    ...validStoredValues(item.normalizedMetadata, "courses"),
    ...canonicalCourses(semanticText),
  ]);
  const subjects = unique([
    ...validStoredValues(item.normalizedMetadata, "subjects"),
    ...canonicalSubjects(rawSubject),
    ...canonicalSubjects(semanticText),
    ...courses
      .map((course) => COURSE_SUBJECTS[course])
      .filter((subject): subject is CanonicalSubject => Boolean(subject)),
  ]);
  if (
    subjects.some((subject) =>
      [
        "biology",
        "chemistry",
        "earth-space-science",
        "engineering",
        "physics",
      ].includes(subject),
    ) &&
    !subjects.includes("general-science")
  )
    subjects.push("general-science");
  const gradeText = foldCatalogText(`${item.gradeLevel ?? ""} ${semanticText}`);
  const gradeBands = unique([
    ...validStoredValues(item.normalizedMetadata, "gradeBands"),
    ...canonicalGradeBands(gradeText),
  ]);
  const formats = unique([
    ...validStoredValues(item.normalizedMetadata, "formats"),
    ...canonicalFormats(foldCatalogText(item.format)),
  ]);
  const languages = unique([
    ...validStoredValues(item.normalizedMetadata, "languages"),
    ...canonicalLanguages(foldCatalogText(item.language), item.url),
  ]);
  const difficultyText = foldCatalogText(
    `${item.difficulty ?? ""} ${semanticText} ${item.gradeLevel ?? ""}`,
  );
  const difficulties = unique([
    ...validStoredValues(item.normalizedMetadata, "difficulties"),
    ...canonicalDifficulties(difficultyText),
  ]);
  if (
    courses.some((course) => course.startsWith("ap-")) &&
    !difficulties.includes("advanced")
  )
    difficulties.push("advanced");
  const providers = unique([
    ...validStoredValues(item.normalizedMetadata, "providers"),
    ...canonicalProviders(provider, item.url),
  ]);
  const licenses = unique([
    ...validStoredValues(item.normalizedMetadata, "licenses"),
    ...canonicalLicenses(foldCatalogText(item.license)),
  ]);
  const accessTypes = unique([
    ...validStoredValues(item.normalizedMetadata, "accessTypes"),
    ...canonicalAccessTypes(foldCatalogText(item.accessType)),
  ]);

  return {
    subjects: subjects.length ? subjects : ["other"],
    courses: courses.length ? courses : ["general"],
    gradeBands: gradeBands.length ? gradeBands : ["unknown"],
    formats: formats.length ? formats : ["other"],
    languages: languages.length ? languages : ["other"],
    difficulties: difficulties.length ? difficulties : ["unknown"],
    providers: providers.length ? providers : ["unknown"],
    licenses: licenses.length ? licenses : ["unknown"],
    accessTypes: accessTypes.length ? accessTypes : ["unknown"],
  };
}

function intersects(first: string[], second: string[]) {
  const values = new Set(first);
  return second.some((value) => values.has(value));
}

function semanticText(
  item: NormalizableResource,
  metadata: NormalizedResourceMetadata,
) {
  return foldCatalogText(
    [
      item.title,
      item.description,
      item.subject,
      item.course,
      item.gradeLevel,
      item.source,
      item.provider,
      item.url,
      ...Object.values(metadata).flat(),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function semanticIntent(value: string) {
  const text = foldCatalogText(value);
  const courses = canonicalCourses(text);
  return {
    text,
    courses,
    subjects: unique([
      ...canonicalSubjects(text),
      ...courses
        .map((course) => COURSE_SUBJECTS[course])
        .filter((subject): subject is CanonicalSubject => Boolean(subject)),
    ]),
    gradeBands: canonicalGradeBands(text),
    formats: canonicalFormats(text),
    languages: canonicalLanguages(text),
    difficulties: canonicalDifficulties(text),
    providers: canonicalValues(text, PROVIDER_ALIASES),
    licenses: canonicalLicenses(text).filter((value) => value !== "unknown"),
  };
}

export function matchesCatalogSearch(
  item: NormalizableResource,
  query: string | null | undefined,
) {
  const value = query?.trim();
  if (!value) return true;
  const metadata = normalizeResourceMetadata(item);
  const intent = semanticIntent(value);
  const corpus = semanticText(item, metadata);
  if (intent.text && corpus.includes(intent.text)) return true;
  if (intent.courses.length && intersects(metadata.courses, intent.courses))
    return true;
  if (intent.subjects.length && intersects(metadata.subjects, intent.subjects))
    return true;
  if (
    intent.providers.length &&
    intersects(metadata.providers, intent.providers)
  )
    return true;
  return meaningfulSearchTerms(value, 12)
    .map(foldCatalogText)
    .filter(Boolean)
    .some((term) => containsAlias(corpus, term));
}

function matchesGradeBands(resource: string[], filter: string[]) {
  if (!filter.length || filter.includes("all-levels")) return true;
  if (resource.includes("all-levels")) return true;
  return intersects(resource, filter);
}

function matchesLanguage(resource: string[], filter: string[]) {
  if (!filter.length || filter.includes("any")) return true;
  if (resource.includes("multilingual")) return true;
  return intersects(resource, filter);
}

function matchesDifficulty(resource: string[], filter: string[]) {
  if (!filter.length) return true;
  if (resource.includes("mixed")) return true;
  return intersects(resource, filter);
}

function excludedFilterTerms(value: string | undefined) {
  return (value ?? "")
    .split(/[,;]+|\s+/)
    .map((term) => term.trim())
    .filter((term) => foldCatalogText(term).length >= 2)
    .slice(0, 12);
}

export function matchesNormalizedResourceFilters(
  item: NormalizableResource,
  filters: NormalizedResourceFilters,
) {
  const metadata = normalizeResourceMetadata(item);
  const corpus = semanticText(item, metadata);

  if (
    !matchesCatalogSearch(
      { ...item, normalizedMetadata: metadata },
      filters.query,
    )
  )
    return false;

  if (filters.exactPhrase) {
    const exactIntent = semanticIntent(filters.exactPhrase);
    const semanticExactMatch =
      (exactIntent.courses.length > 0 &&
        intersects(metadata.courses, exactIntent.courses)) ||
      (exactIntent.subjects.length > 0 &&
        intersects(metadata.subjects, exactIntent.subjects));
    if (!corpus.includes(exactIntent.text) && !semanticExactMatch) return false;
  }

  if (
    excludedFilterTerms(filters.excludedWords).some((term) =>
      matchesCatalogSearch({ ...item, normalizedMetadata: metadata }, term),
    )
  )
    return false;

  if (filters.format) {
    const requested = canonicalFormats(foldCatalogText(filters.format));
    if (!requested.length || !intersects(metadata.formats, requested))
      return false;
  }

  if (filters.subject) {
    const intent = semanticIntent(filters.subject);
    const matches =
      intersects(metadata.subjects, intent.subjects) ||
      intersects(metadata.courses, intent.courses) ||
      (!intent.subjects.length &&
        !intent.courses.length &&
        containsAlias(corpus, intent.text));
    if (!matches) return false;
  }

  if (filters.course) {
    const requested = canonicalCourses(foldCatalogText(filters.course));
    if (!requested.length || !intersects(metadata.courses, requested))
      return false;
  }

  if (filters.gradeLevel) {
    const requested = canonicalGradeBands(foldCatalogText(filters.gradeLevel));
    if (!requested.length || !matchesGradeBands(metadata.gradeBands, requested))
      return false;
  }

  if (filters.language && foldCatalogText(filters.language) !== "any") {
    const requested = canonicalLanguages(foldCatalogText(filters.language));
    if (!requested.length || !matchesLanguage(metadata.languages, requested))
      return false;
  }

  if (filters.difficulty) {
    const requested = canonicalDifficulties(
      foldCatalogText(filters.difficulty),
    );
    if (
      !requested.length ||
      !matchesDifficulty(metadata.difficulties, requested)
    )
      return false;
  }

  if (filters.source) {
    const requested = semanticIntent(filters.source);
    if (
      requested.providers.length
        ? !intersects(metadata.providers, requested.providers)
        : !containsAlias(corpus, requested.text)
    )
      return false;
  }

  if (
    filters.license === "known" &&
    !metadata.licenses.some((license) => license !== "unknown")
  )
    return false;
  if (
    filters.license === "reusable" &&
    !metadata.licenses.some((license) => REUSABLE_LICENSES.has(license))
  )
    return false;
  if (filters.license && !["known", "reusable"].includes(filters.license)) {
    const requested = semanticIntent(filters.license).licenses;
    if (!requested.length || !intersects(metadata.licenses, requested))
      return false;
  }

  if (filters.accessType === "free") {
    if (
      !metadata.accessTypes.some((value) =>
        ["open", "free-account"].includes(value),
      )
    )
      return false;
  } else if (["no_account", "open"].includes(filters.accessType ?? "")) {
    if (!metadata.accessTypes.includes("open")) return false;
  }

  return true;
}

/**
 * SQL search uses these only as a broad preselection. The normalized matcher is
 * authoritative; expanding aliases here prevents the database from discarding
 * semantically equivalent rows before that matcher sees them.
 */
export function expandedCatalogSearchTerms(value: string, limit = 80) {
  const intent = semanticIntent(value);
  const expansions = [
    ...meaningfulSearchTerms(value, 16),
    ...SUBJECT_ALIASES.filter((entry) =>
      intent.subjects.includes(entry.canonical),
    ).flatMap((entry) => entry.aliases),
    ...COURSE_ALIASES.filter((entry) =>
      intent.courses.includes(entry.canonical),
    ).flatMap((entry) => entry.aliases),
    ...PROVIDER_ALIASES.filter((entry) =>
      intent.providers.includes(entry.canonical),
    ).flatMap((entry) => entry.aliases),
  ]
    .flatMap((term) => meaningfulSearchTerms(term, 8))
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  return unique(expansions).slice(0, limit);
}

/**
 * Return both sides of a filter vocabulary for the database preselection.
 * The canonical values address newly-normalized rows; aliases keep legacy
 * provider rows eligible until they are next refreshed and persisted.
 */
export function expandedCatalogFacet(
  facet: CatalogMetadataFacet,
  value: string,
): ExpandedCatalogFacet {
  const parts = value.split(/[,;]+/).map(foldCatalogText).filter(Boolean);
  const intents = parts.map(semanticIntent);
  let canonical = unique(
    intents.flatMap((intent) => {
      if (facet === "subjects") return intent.subjects;
      if (facet === "courses") return intent.courses;
      if (facet === "gradeBands") return intent.gradeBands;
      if (facet === "formats") return intent.formats;
      if (facet === "languages") return intent.languages;
      if (facet === "difficulties") return intent.difficulties;
      if (facet === "providers") return intent.providers;
      if (facet === "licenses") return intent.licenses;
      return parts.flatMap((part) => canonicalAccessTypes(part));
    }),
  );

  if (facet === "accessTypes" && parts.includes("free"))
    canonical = unique([...canonical, "open", "free-account"]);
  if (facet === "licenses" && parts.includes("known"))
    canonical = CANONICAL_LICENSES.filter((license) => license !== "unknown");
  if (facet === "licenses" && parts.includes("reusable"))
    canonical = [...REUSABLE_LICENSES];

  const entries: Aliases<string> =
    facet === "subjects"
      ? SUBJECT_ALIASES
      : facet === "courses"
        ? COURSE_ALIASES
        : facet === "gradeBands"
          ? GRADE_ALIASES
          : facet === "formats"
            ? FORMAT_ALIASES
            : facet === "languages"
              ? LANGUAGE_ALIASES
              : facet === "difficulties"
                ? DIFFICULTY_ALIASES
                : facet === "providers"
                  ? PROVIDER_ALIASES
                  : facet === "licenses"
                    ? LICENSE_ALIASES
                    : [
                        {
                          canonical: "open",
                          aliases: ["open", "free", "no account"],
                        },
                        {
                          canonical: "free-account",
                          aliases: ["free account", "registration required"],
                        },
                        {
                          canonical: "paid",
                          aliases: ["paid", "subscription"],
                        },
                      ];
  const aliases = unique([
    ...parts,
    ...entries
      .filter((entry) => canonical.includes(entry.canonical))
      .flatMap((entry) =>
        entry.aliases.flatMap((alias) => [alias, foldCatalogText(alias)]),
      ),
  ]);

  if (facet === "gradeBands" && canonical.includes("high-school"))
    aliases.push("9th grade", "10th grade", "11th grade", "12th grade");
  if (facet === "gradeBands" && !canonical.includes("all-levels")) {
    canonical.push("all-levels");
    aliases.push("all levels", "all ages", "all grades", "any grade");
  }
  if (facet === "languages" && !canonical.includes("multilingual")) {
    canonical.push("multilingual");
    aliases.push("multilingual", "multiple languages", "many languages");
  }
  if (facet === "difficulties" && !canonical.includes("mixed")) {
    canonical.push("mixed");
    aliases.push("mixed", "all levels", "multiple levels");
  }

  return { canonical: unique(canonical), aliases: unique(aliases) };
}

export function reusableCanonicalLicense(value: string | null | undefined) {
  return canonicalLicenses(foldCatalogText(value)).some((license) =>
    REUSABLE_LICENSES.has(license),
  );
}
