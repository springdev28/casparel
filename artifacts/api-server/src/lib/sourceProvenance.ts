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
      "This domain is not yet in Schoolar's maintained source registry.",
    summary: known
      ? `${resource.title} is hosted by ${sourceName}. This quick check uses Schoolar's maintained provenance registry and stored metadata, so it spends no AI credits and avoids unsupported live-research claims.`
      : `${resource.title} is hosted on ${sourceName}. Schoolar does not yet have enough maintained provenance data to rate this source; verify its author, publication date, evidence, and usage rights before relying on it.`,
    reputationAnalysis: null,
    audienceSentiment: null,
    contentQuality: null,
    currencyAssessment: null,
    researchScope:
      "Stored resource metadata and Schoolar's maintained institutional provenance registry; no AI or live web research.",
    strengths: known ? [known.reason] : [],
    concerns: known
      ? [
          "Publisher reputation does not guarantee that every resource is current or suitable for every curriculum.",
        ]
      : [
          "Publisher identity and editorial process have not been independently verified by Schoolar.",
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
