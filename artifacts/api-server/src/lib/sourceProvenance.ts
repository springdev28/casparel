type KnownSource = {
  name: string;
  type: string;
  description: string;
  trust: "high" | "medium";
  reason: string;
  founded?: string;
  headquarters?: string;
  license?: string;
};

const sources: Record<string, KnownSource> = {
  "ocw.mit.edu": {
    name: "MIT OpenCourseWare",
    type: "open-courseware",
    description:
      "An open publication of course materials from the Massachusetts Institute of Technology.",
    trust: "high",
    reason:
      "Published by an accredited university through its official open-courseware program.",
    founded: "2001",
    headquarters: "Cambridge, Massachusetts, United States",
    license: "CC BY-NC-SA 4.0",
  },
  "openstax.org": {
    name: "OpenStax",
    type: "nonprofit",
    description:
      "A nonprofit Rice University initiative publishing peer-reviewed open textbooks.",
    trust: "high",
    reason:
      "Based at an accredited university with documented textbook review and licensing practices.",
    founded: "2012",
    headquarters: "Houston, Texas, United States",
  },
  "phet.colorado.edu": {
    name: "PhET Interactive Simulations",
    type: "university",
    description:
      "A University of Colorado Boulder project publishing research-based interactive simulations.",
    trust: "high",
    reason:
      "Published by an accredited university and developed as an education research project.",
    founded: "2002",
    headquarters: "Boulder, Colorado, United States",
    license: "CC BY 4.0 unless an item states otherwise",
  },
  "khanacademy.org": {
    name: "Khan Academy",
    type: "nonprofit",
    description:
      "A nonprofit educational platform providing free lessons and practice across many subjects.",
    trust: "medium",
    reason:
      "An established education nonprofit; local curriculum alignment should still be checked.",
    founded: "2008",
    headquarters: "Mountain View, California, United States",
  },
  "nasa.gov": {
    name: "NASA",
    type: "government",
    description:
      "The United States government agency responsible for civil space exploration and aeronautics research.",
    trust: "high",
    reason:
      "An official government domain and primary source for NASA science and education materials.",
    founded: "1958",
    headquarters: "Washington, D.C., United States",
  },
  "loc.gov": {
    name: "Library of Congress",
    type: "government",
    description:
      "The national library of the United States and a major primary-source collection.",
    trust: "high",
    reason:
      "The official Library of Congress domain and a primary institutional source.",
    headquarters: "Washington, D.C., United States",
  },
  "learninglab.si.edu": {
    name: "Smithsonian Learning Lab",
    type: "nonprofit",
    description:
      "An educational discovery and collection platform from the Smithsonian Institution.",
    trust: "high",
    reason:
      "Published by the Smithsonian Institution with clearly attributed collection material.",
    headquarters: "Washington, D.C., United States",
  },
  "owl.purdue.edu": {
    name: "Purdue Online Writing Lab",
    type: "university",
    description:
      "Writing, research, and citation guidance published by Purdue University.",
    trust: "high",
    reason: "Maintained on an accredited university's official domain.",
    headquarters: "West Lafayette, Indiana, United States",
  },
  "developer.mozilla.org": {
    name: "MDN Web Docs",
    type: "nonprofit",
    description:
      "Community-maintained documentation and learning material for open web technologies, stewarded by Mozilla.",
    trust: "high",
    reason:
      "An established primary reference for interoperable web platform technologies.",
    license: "Most written content is available under CC BY-SA 2.5 or later",
  },
  "openlibrary.org": {
    name: "Open Library",
    type: "nonprofit",
    description:
      "An Internet Archive project providing an open book catalog and reading or lending links.",
    trust: "medium",
    reason:
      "An established nonprofit catalog; edition metadata and linked-item rights can vary.",
    founded: "2006",
    headquarters: "San Francisco, California, United States",
  },
  /*
   * The catalogue's own providers.
   *
   * Casparel searches DOAB, DOAJ, Europe PMC, arXiv, OpenAlex, Project
   * Gutenberg, the Internet Archive and the Wikimedia projects, and until now
   * only one of them -- Open Library -- was in this registry. So the quick
   * check answered a book the product had just recommended with "this domain
   * is not yet in Casparel's maintained source registry ... verify its author,
   * publication date, evidence and usage rights before relying on it". Told
   * about Project Gutenberg. That is the trust claim failing on the product's
   * own shelf.
   *
   * Ratings are what the source is, not how much we like it. A preprint server
   * is moderated and not peer-reviewed; an archive is a custodian rather than
   * a publisher; an open wiki is editable by anyone. Each is "medium" with the
   * caveat named, because a student deciding whether to cite something needs
   * the caveat more than the compliment.
   *
   * YouTube is deliberately absent. It is a platform, not a publisher: rating
   * the domain would be rating every uploader on it at once, and "unknown,
   * check it yourself" is the true answer for a video.
   */
  "gutenberg.org": {
    name: "Project Gutenberg",
    type: "nonprofit",
    description:
      "A volunteer library of public-domain books, digitised and proofread by contributors.",
    trust: "high",
    reason:
      "A long-established nonprofit library that publishes transcriptions of works already in the public domain, with a documented proofreading process.",
    founded: "1971",
    license: "Public domain in the United States, distributed under the Project Gutenberg License",
  },
  "archive.org": {
    name: "Internet Archive",
    type: "nonprofit",
    description:
      "A nonprofit digital library preserving web pages, books, audio and moving images.",
    trust: "medium",
    reason:
      "An established nonprofit custodian, but much of the collection is uploaded by others: the Archive vouches for preservation rather than for what was preserved.",
    founded: "1996",
    headquarters: "San Francisco, California, United States",
  },
  "doaj.org": {
    name: "Directory of Open Access Journals",
    type: "nonprofit",
    description:
      "A community-curated index of peer-reviewed open-access journals.",
    trust: "high",
    reason:
      "Journals are admitted against published inclusion criteria that require peer review and transparent editorial practice.",
    founded: "2003",
  },
  "doabooks.org": {
    name: "Directory of Open Access Books",
    type: "nonprofit",
    description:
      "An index of peer-reviewed open-access academic books, operated by the OAPEN Foundation.",
    trust: "high",
    reason:
      "Titles are admitted against published criteria that require academic peer review.",
    founded: "2012",
  },
  "arxiv.org": {
    name: "arXiv",
    type: "preprint-server",
    description:
      "An open repository of scholarly preprints, operated by Cornell University.",
    trust: "medium",
    reason:
      "Submissions are moderated for scope, not peer-reviewed: a paper here may be sound, revised later, or never accepted anywhere.",
    founded: "1991",
    headquarters: "Ithaca, New York, United States",
  },
  "europepmc.org": {
    name: "Europe PMC",
    type: "repository",
    description:
      "A life-sciences literature database developed and maintained by EMBL-EBI.",
    trust: "medium",
    reason:
      "An established institutional database, but it indexes preprints alongside peer-reviewed articles: which one you are reading has to be checked on the record itself.",
  },
  "openalex.org": {
    name: "OpenAlex",
    type: "index",
    description:
      "An open index of scholarly works, authors and institutions, published by OurResearch.",
    trust: "medium",
    reason:
      "A catalogue rather than a publisher: it records what exists and does not assess it, so the work it points at still has to be judged on its own.",
  },
  "wikibooks.org": {
    name: "Wikibooks",
    type: "open-textbook",
    description:
      "A Wikimedia project publishing open textbooks written collaboratively.",
    trust: "medium",
    reason:
      "Anyone may edit it. Every change is public and revertible, and pages vary from carefully sourced to barely started, so a specific page has to be judged rather than the site.",
  },
  "wikiversity.org": {
    name: "Wikiversity",
    type: "open-courseware",
    description:
      "A Wikimedia project hosting collaboratively written learning materials.",
    trust: "medium",
    reason:
      "Anyone may edit it, and much of it is coursework in progress rather than finished material; judge the page, not the site.",
  },
  "wikisource.org": {
    name: "Wikisource",
    type: "digital-library",
    description:
      "A Wikimedia library of source texts, transcribed and proofread by volunteers.",
    trust: "medium",
    reason:
      "Transcriptions are volunteer-made against scans anyone can check, which is a strength for provenance and no guarantee against a typo; the underlying work is whatever it always was.",
  },
  "wikipedia.org": {
    name: "Wikipedia",
    type: "encyclopedia",
    description:
      "A collaboratively written encyclopedia published by the Wikimedia Foundation.",
    trust: "medium",
    reason:
      "Anyone may edit it, with public revision history and citation norms. Useful for orientation and for finding sources; Wikipedia's own guidance is not to cite it as one.",
    founded: "2001",
  },
  "plato.stanford.edu": {
    name: "Stanford Encyclopedia of Philosophy",
    type: "university",
    description:
      "An expert-authored and editorially reviewed philosophy reference published by Stanford University.",
    trust: "high",
    reason:
      "Maintained through an academic editorial process on Stanford University's official domain.",
    founded: "1995",
    headquarters: "Stanford, California, United States",
  },
};

type QuickResource = {
  title: string;
  url: string;
  subject: string;
  gradeLevel: string;
  format: string;
  thumbnailUrl: string | null;
  createdAt: string;
};

export function buildFreeQuickReview(
  resource: QuickResource,
  stats: { avgRating: number; reviewCount: number },
) {
  const url = new URL(resource.url);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const known =
    sources[host] ??
    Object.entries(sources).find(([domain]) =>
      host.endsWith(`.${domain}`),
    )?.[1] ??
    null;
  const sourceName = known?.name ?? host;
  return {
    sourceName,
    sourceType: known?.type ?? "other",
    description: known?.description ?? null,
    founded: known?.founded ?? null,
    headquarters: known?.headquarters ?? null,
    trustLevel: known?.trust ?? ("unknown" as const),
    trustReason:
      known?.reason ??
      "This domain is not yet in Casparel's maintained source registry.",
    summary: known
      ? `${resource.title} is hosted by ${sourceName}. This quick check uses Casparel's maintained provenance registry and stored metadata, so it spends no AI credits and avoids unsupported live-research claims.`
      : `${resource.title} is hosted on ${sourceName}. Casparel does not yet have enough maintained provenance data to rate this source; verify its author, publication date, evidence, and usage rights before relying on it.`,
    reputationAnalysis: null,
    audienceSentiment: null,
    contentQuality: null,
    currencyAssessment: null,
    researchScope:
      "Stored resource metadata and Casparel's maintained institutional provenance registry; no AI or live web research.",
    strengths: known ? [known.reason] : [],
    concerns: known
      ? [
          "Publisher reputation does not guarantee that every resource is current or suitable for every curriculum.",
        ]
      : [
          "Publisher identity and editorial process have not been independently verified by Casparel.",
        ],
    limitations: [
      "Quick checks do not inspect the full resource or current public discussion.",
      "Use Deep Research only when a decision requires current external evidence.",
    ],
    links: [{ label: "Source website", url: `${url.protocol}//${url.host}/` }],
    mentions: [],
    mode: "quick" as const,
    resourceProfile: {
      provider: sourceName,
      author: null,
      sourceDomain: host,
      uploadTime: null,
      lastEdited: null,
      addedToSchoolar: resource.createdAt,
      subject: resource.subject,
      gradeLevel: resource.gradeLevel,
      format: resource.format,
      language: null,
      difficulty: null,
      accessType: known ? "Publicly accessible when catalogued" : null,
      license: known?.license ?? null,
      duration: null,
      readingTime: null,
      captions: null,
      transcript: null,
      audience: null,
      keywords: [],
      hasThumbnail: Boolean(resource.thumbnailUrl),
      avgRating: stats.avgRating,
      reviewCount: stats.reviewCount,
    },
  };
}
