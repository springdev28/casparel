/**
 * What a search returns, checked against a real Postgres.
 *
 * These cover the defects a mocked database cannot see, because they live in
 * what `~*` and `ILIKE` actually match and in how the endpoint assembles a
 * page: unrelated results, the same work more than once, and a "search more"
 * that hands back almost nothing.
 *
 * CI has no database, so they skip unless one is provided. Every other test in
 * this package mocks the database and must keep doing so.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run
 *
 * Catalog rows, resources and users are all emptied, so point this at a
 * throwaway database.
 *
 * One file on purpose. Each suite needs a catalog it fully controls, and Vitest
 * runs separate files in parallel workers: as two files these truncated each
 * other's fixtures mid-run, and the paging suite read the relevance suite's
 * three rows and reported that "physics mechanics" had two results. Suites
 * within one file run in order, so each seed survives its own assertions.
 *
 * Other db test files are held off by the lock rather than by that convention;
 * see dbTestLock.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { useExclusiveDatabase } from "./dbTestLock.js";

const url = process.env.VERIFY_DATABASE_URL;

useExclusiveDatabase();

/** The query that started all of this, typed exactly as a reader typed it. */
const AP_QUERY = "AP Physics C: Electricity and Mechanics";

async function database() {
  process.env.DATABASE_URL = url;
  const db = await import("@workspace/db");
  await db.runMigrations();
  return db;
}

describe.skipIf(!url)("search relevance against a real database", () => {
  /**
   * The rows that came back from the live site for an AP Physics search and
   * should not have. The query is tokenised and the tokens are OR-ed, so
   * `%AP%` matched inside "roadmAP", and a word-start match alone still opened
   * "Apps" and "APIs".
   */
  beforeAll(async () => {
    const { db, catalogResourcesTable } = await database();
    await db.delete(catalogResourcesTable);
    await db.insert(catalogResourcesTable).values([
      {
        provider: "GUVI",
        providerUrl: "https://guvi.in/",
        externalId: "guvi:roadmap",
        canonicalUrl: "https://guvi.in/blog/full-stack-roadmap",
        title: "Full Stack Web Development Roadmap – GUVI (2026)",
        description:
          "Roadmap and learning path for becoming a modern full-stack developer with multiple tracks.",
        format: "article",
        subject: "Full-Stack Web Development",
        gradeLevel: "Adult",
        sourceKind: "curated",
      },
      {
        provider: "OpenStax",
        providerUrl: "https://openstax.org/",
        externalId: "openstax:physics",
        canonicalUrl: "https://openstax.org/details/books/university-physics",
        title: "University Physics: Electricity and Magnetism",
        description:
          "Electricity, magnetism and mechanics for calculus-based courses.",
        format: "pdf",
        subject: "Physics",
        gradeLevel: "College",
        sourceKind: "curated",
      },
      {
        provider: "MIT OpenCourseWare",
        providerUrl: "https://ocw.mit.edu/",
        externalId: "mit:mechanics",
        canonicalUrl: "https://ocw.mit.edu/courses/8-01-classical-mechanics",
        title: "Classical Mechanics",
        description: "Newtonian mechanics for first-year undergraduates.",
        format: "video",
        subject: "Physics",
        gradeLevel: "College",
        sourceKind: "curated",
      },
      {
        provider: "GeoGebra",
        providerUrl: "https://geogebra.org/",
        externalId: "geogebra:apps",
        canonicalUrl: "https://www.geogebra.org/apps",
        title: "GeoGebra Math Apps",
        description:
          "Interactive graphing, geometry, 3D, probability, and algebra tools for mathematical exploration.",
        format: "interactive",
        subject: "Mathematics",
        gradeLevel: "All levels",
        sourceKind: "curated",
      },
      {
        provider: "University of Helsinki",
        providerUrl: "https://fullstackopen.com/",
        externalId: "helsinki:fullstackopen",
        canonicalUrl: "https://fullstackopen.com/en/",
        title: "Full Stack Open",
        description:
          "A project-based course in modern JavaScript web development with React, Node.js, APIs, testing and TypeScript.",
        format: "article",
        subject: "Computer Science",
        gradeLevel: "Higher education",
        sourceKind: "curated",
      },
    ]);
  }, 60_000);

  it("does not answer an AP Physics search with a full-stack roadmap", async () => {
    const { searchCatalog } = await import("./lib/catalog");
    const titles = (await searchCatalog({ query: AP_QUERY })).map(
      (r) => r.title,
    );

    expect(titles).not.toContain(
      "Full Stack Web Development Roadmap – GUVI (2026)",
    );
    // "AP" is a whole word here, not the opening of "Apps" or "APIs".
    expect(titles).not.toContain("GeoGebra Math Apps");
    expect(titles).not.toContain("Full Stack Open");
    // Matches three of the four query words, so it ranks above the one that
    // matches only "Mechanics".
    expect(titles[0]).toBe("University Physics: Electricity and Magnetism");
    expect(titles).toContain("Classical Mechanics");
  });

  it("still matches a whole word from a prefix, and survives punctuation", async () => {
    const { searchCatalog } = await import("./lib/catalog");
    expect(
      (await searchCatalog({ query: "physic" })).map((r) => r.subject),
    ).toContain("Physics");
    await expect(searchCatalog({ query: "C++" })).resolves.toBeInstanceOf(Array);
  });
});

describe.skipIf(!url)("the library listing against a real database", () => {
  beforeAll(async () => {
    const { db, resourcesTable, usersTable } = await database();
    await db.delete(resourcesTable);
    await db.delete(usersTable);
    const [author] = await db
      .insert(usersTable)
      .values({
        email: "verify@example.invalid",
        passwordHash: "x",
        name: "Verify",
        role: "student",
      })
      .returning({ id: usersTable.id });
    await db.insert(resourcesTable).values([
      {
        title: "Full Stack Web Development Roadmap – GUVI (2026)",
        url: "https://guvi.in/blog/full-stack-roadmap",
        description:
          "Roadmap and learning path for becoming a modern full-stack developer.",
        format: "article",
        subject: "Full-Stack Web Development",
        gradeLevel: "Adult",
        submittedById: author.id,
        verificationStatus: "verified",
      },
      {
        title: "Classical Mechanics",
        url: "https://ocw.mit.edu/courses/8-01-classical-mechanics",
        description: "Newtonian mechanics for first-year undergraduates.",
        format: "video",
        subject: "Physics",
        gradeLevel: "College",
        submittedById: author.id,
        verificationStatus: "verified",
      },
    ]);
  }, 60_000);

  it("does not answer an AP Physics library search with a full-stack roadmap", async () => {
    const express = (await import("express")).default;
    const request = (await import("supertest")).default;
    const { default: resourcesRouter } = await import("./routes/resources.js");
    const app = express();
    app.use(express.json());
    app.use("/api", resourcesRouter);

    const res = await request(app).get("/api/resources").query({ q: AP_QUERY });

    expect(res.status).toBe(200);
    expect((res.body as { title: string }[]).map((r) => r.title)).toEqual([
      "Classical Mechanics",
    ]);
  });
});

type Row = {
  title: string;
  provider: string;
  url: string;
  description: string;
  subject: string;
  sourceKind?: "curated" | "wikibooks" | "wikipedia" | "wikiversity";
  /** What kind of thing it is, which is what the paper delay reads. */
  material?: string;
};

/**
 * A slice of a realistic catalog: the works that should answer an AP Physics
 * search, the near-misses that should not, and the shapes that used to arrive
 * twice.
 */
const ROWS: Row[] = [
  {
    title: "AP Physics C: Mechanics",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/AP_Physics_C:_Mechanics",
    description:
      "Advanced Placement Physics C: Mechanics is a calculus-based physics course covering kinematics, forces and energy.",
    subject: "Physics",
  },
  {
    title: "AP Physics C: Electricity and Magnetism",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/AP_Physics_C:_Electricity_and_Magnetism",
    description:
      "A calculus-based course covering electricity, magnetism, circuits and electrostatics.",
    subject: "Physics",
  },
  {
    title: "AP Physics 1",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/AP_Physics_1",
    description: "An algebra-based physics course covering mechanics and waves.",
    subject: "Physics",
  },
  {
    title: "AP Physics B",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/AP_Physics_B",
    description: "A retired algebra-based physics course covering mechanics.",
    subject: "Physics",
  },
  // Same work, two links: this is what put a book and its print version on
  // one page as separate cards.
  {
    title: "AP Physics C",
    provider: "Wikibooks",
    url: "https://en.wikibooks.org/wiki/AP_Physics_C",
    description: "A book covering topics in AP physics mechanics and E/M.",
    subject: "Physics",
  },
  {
    title: "AP Physics C",
    provider: "Wikibooks",
    url: "https://en.wikibooks.org/wiki/AP_Physics_C_(print)",
    description: "An open educational work from en.wikibooks.org.",
    subject: "Physics",
  },
  // Matches exactly one word of the query and nothing else. A Florida high
  // school came back for AP Physics because its article mentions AP courses.
  {
    title: "Horizon High School",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Horizon_High_School",
    description:
      "A public high school offering AP courses, athletics and performing arts.",
    subject: "Interdisciplinary",
  },
  {
    title: "General Astronomy",
    provider: "Wikibooks",
    url: "https://en.wikibooks.org/wiki/General_Astronomy",
    description:
      "Astronomy is the scientific study of celestial bodies in the visible universe.",
    subject: "Astronomy",
  },
  {
    title: "GeoGebra Math Apps",
    provider: "GeoGebra",
    url: "https://www.geogebra.org/apps",
    description: "Interactive graphing, geometry and algebra tools.",
    subject: "Mathematics",
  },
  // A literature question and a science question, each with a paper and a book,
  // so which one comes first can be measured.
  {
    title: "Hamlet, Prince of Denmark",
    provider: "Project Gutenberg",
    url: "https://www.gutenberg.org/ebooks/27761",
    description: "The full text of Hamlet by William Shakespeare.",
    subject: "Literature",
    material: "primary",
  },
  {
    title: "Hamlet and the tragedy of revenge",
    provider: "OpenAlex",
    url: "https://example.org/hamlet-revenge-paper",
    description: "A study of revenge structure in Hamlet.",
    subject: "Literature",
    material: "paper",
  },
  {
    title: "Chemistry of the chlorophyll molecule",
    provider: "Directory of Open Access Books",
    url: "https://directory.doabooks.org/handle/chlorophyll-book",
    description: "A book on the chemistry of chlorophyll and light capture.",
    subject: "Chemistry",
    material: "book",
  },
  {
    title: "Chemistry of light capture in photosystem II",
    provider: "Europe PMC",
    url: "https://europepmc.org/article/PMC/chemistry-paper",
    description: "A paper on the chemistry of photosystem II.",
    subject: "Chemistry",
    material: "paper",
  },
  // Works about photosynthesis that are not named after it. Wikipedia's own
  // search returns these for "photosynthesis" and the importer stores them, but
  // a bar of two points on a one-word query meant only a title match counted,
  // so they were in the catalog and unreachable.
  {
    title: "Chlorophyll",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Chlorophyll",
    description:
      "Chlorophyll is the pigment that absorbs light for photosynthesis in plants, algae and cyanobacteria.",
    subject: "Biology",
  },
  {
    title: "Calvin cycle",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Calvin_cycle",
    description:
      "A series of redox reactions that fix carbon during the light-independent stage of photosynthesis.",
    subject: "Biology",
  },
  {
    title: "Photosynthesis",
    provider: "Wikibooks",
    url: "https://en.wikibooks.org/wiki/Photosynthesis",
    description: "How plants turn light into chemical energy.",
    subject: "Biology",
  },
  {
    title: "Full Stack Open",
    provider: "University of Helsinki",
    url: "https://fullstackopen.com/en/",
    description:
      "A project-based course in modern JavaScript web development with React, Node.js and APIs.",
    subject: "Computer Science",
  },
  // The live catalog's own rows, verbatim. A physics search returned fifteen of
  // these and nothing else: the broadening ladder had asked YouTube for plain
  // "tutorial", which is a question about t-shirts, and every answer then
  // cleared a two-point bar on that one word being in its title.
  {
    title: "How To Heat Press A T-Shirt 101 ~ Easy Tutorial",
    provider: "YouTube",
    url: "https://www.youtube.com/watch?v=cIgQpkEkhXA",
    description:
      "How to heat press a t-shirt is a popular thing to google because many people are getting into the t-shirt making business.",
    subject: "Interdisciplinary",
    material: "video",
  },
  {
    title: "Retro Sunset T-Shirt Design Tutorial | Adobe Illustrator",
    provider: "YouTube",
    url: "https://www.youtube.com/watch?v=QUpsay-6aEk",
    description: "A step-by-step t-shirt design tutorial in Adobe Illustrator.",
    subject: "Interdisciplinary",
    material: "video",
  },
  // Papers and a video that share exactly one word with that same search, all
  // of them live rows it returned. "Motion" is the word, and it is the only one.
  {
    title:
      "Strabismic imaging for correcting in-plane motion distortion in scanning microscopy",
    provider: "Europe PMC",
    url: "https://europepmc.org/article/PMC/strabismic-motion",
    description: "A paper on correcting motion distortion during imaging.",
    subject: "Biology",
    material: "paper",
  },
  {
    title: "Quadratic Motion Polynomials with Irregular Factorizations",
    provider: "Europe PMC",
    url: "https://europepmc.org/article/PMC/quadratic-motion",
    description: "A paper on the factorization of motion polynomials.",
    subject: "Biology",
    material: "paper",
  },
  {
    title: "Claude Design FINALLY Solved Motion Graphics",
    provider: "YouTube",
    url: "https://www.youtube.com/watch?v=motion-graphics",
    description: "A video about motion graphics in a design tool.",
    subject: "Interdisciplinary",
    material: "video",
  },
  // What that search was actually asking for. The first two match two words of
  // it; the third matches one, in its title, and is the reason the rule cannot
  // simply demand two of everything.
  {
    title: "Projectile motion",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Projectile_motion",
    description:
      "The motion of an object thrown near the surface of the Earth, moving along a curved path under gravity alone.",
    subject: "Physics",
  },
  {
    title: "Kinematics of projectiles",
    provider: "PhET Interactive Simulations",
    url: "https://phet.colorado.edu/en/simulation/projectile-motion",
    description: "An interactive simulation of a projectile's flight.",
    subject: "Physics",
    material: "reference",
  },
  {
    title: "Newton's laws of motion",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Newton%27s_laws_of_motion",
    description:
      "Three laws relating the forces acting on a body to its movement.",
    subject: "Physics",
  },
  {
    title: "Kinematics",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Kinematics",
    description:
      "The branch of physics describing the motion of points and bodies without considering the forces that cause them to move.",
    subject: "Physics",
  },
];

/** Enough distinct physics works to fill more than one page. */
function fillerRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Physics Mechanics Workbook ${index + 1}`,
    provider: "Wikibooks",
    url: `https://en.wikibooks.org/wiki/Physics_Mechanics_Workbook_${index + 1}`,
    description: `Worked problems in physics and mechanics, volume ${index + 1}.`,
    subject: "Physics",
  }));
}

/**
 * The French Revolution, and the many other revolutions the catalog holds.
 *
 * The proportion is the point, not the titles: "revolution" has to be a word
 * this catalog is full of and "guillotine" a word it barely uses, or there is
 * nothing for a rarity rule to tell apart.
 */
const REVOLUTIONS: Row[] = [
  {
    title: "Glossary of the French Revolution",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Glossary_of_the_French_Revolution",
    description: "Terms used during the French Revolution.",
    subject: "History",
  },
  {
    title: "The guillotine",
    provider: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Guillotine",
    description:
      "The device used for executions in France during the Revolution.",
    subject: "History",
  },
  ...[
    "Russian Revolution",
    "American Revolution",
    "Industrial Revolution",
    "Chinese Revolution",
    "Cuban Revolution",
    "Scientific Revolution",
    "Green Revolution",
    "Digital Revolution",
  ].map((title) => ({
    title,
    provider: "Wikiversity",
    url: `https://en.wikiversity.org/wiki/${title.replace(/\s+/g, "_")}`,
    description: `An open educational work about the ${title}.`,
    subject: "History",
  })),
];

describe.skipIf(!url)("search quality against a real database", () => {
  let searchCatalog: typeof import("./lib/catalog").searchCatalog;
  let resolveCatalogSearch: typeof import("./lib/catalog").resolveCatalogSearch;

  beforeAll(async () => {
    const { db, catalogResourcesTable } = await database();
    await db.delete(catalogResourcesTable);
    await db.insert(catalogResourcesTable).values(
      [...ROWS, ...REVOLUTIONS, ...fillerRows(20)].map((row) => ({
        provider: row.provider,
        providerUrl: new URL(row.url).origin + "/",
        externalId: row.url,
        canonicalUrl: row.url,
        title: row.title,
        description: row.description,
        format: "article" as const,
        subject: row.subject,
        gradeLevel: "All levels",
        sourceKind: row.sourceKind ?? ("curated" as const),
        ...(row.material ? { metadata: { material: row.material } } : {}),
      })),
    );
    const catalog = await import("./lib/catalog");
    // Word frequencies are cached, and this fixture has just replaced every row
    // the catalog had. Without this the rarity rule reads the previous suite's
    // counts and nothing it decides means anything.
    catalog.clearTermFrequencyCache();
    ({ searchCatalog, resolveCatalogSearch } = catalog);
  }, 60_000);

  /** A search resolved the way the endpoint resolves one, then run. */
  async function search(options: Parameters<typeof searchCatalog>[0]) {
    const resolved = await resolveCatalogSearch(options);
    return (
      await searchCatalog({
        ...options,
        offset: resolved.offset,
        minRelevanceScore: resolved.minRelevanceScore,
        requireNarrowCoverage: resolved.requireNarrowCoverage,
        requireTopicCoverage: resolved.requireTopicCoverage,
        distinguishingTerms: resolved.distinguishingTerms,
      })
    ).map((r) => r.title);
  }

  it("answers only with works that match more than one word of the query", async () => {
    const titles = (await searchCatalog({ query: AP_QUERY })).map(
      (r) => r.title,
    );

    expect(titles).toContain("AP Physics C: Mechanics");
    expect(titles).toContain("AP Physics C: Electricity and Magnetism");
    // One word of four is a coincidence, not a match.
    expect(titles).not.toContain("Horizon High School");
    expect(titles).not.toContain("General Astronomy");
    expect(titles).not.toContain("GeoGebra Math Apps");
    expect(titles).not.toContain("Full Stack Open");
  });

  it("ranks a work matching more of the query higher", async () => {
    const titles = (await searchCatalog({ query: AP_QUERY })).map(
      (r) => r.title,
    );
    expect(titles.indexOf("AP Physics C: Mechanics")).toBeLessThan(
      titles.indexOf("AP Physics B"),
    );
  });

  it("answers a one-word search with the works about it, not only those named after it", async () => {
    const results = await searchCatalog({ query: "photosynthesis" });
    const titles = results.map((r) => r.title);

    expect(titles).toContain("Photosynthesis");
    // The reason "photosynthesis" ran dry on page two: these are what a reader
    // wants next, and demanding the word in the title hid them.
    expect(titles).toContain("Chlorophyll");
    expect(titles).toContain("Calvin cycle");
    // The work named after the topic still comes first.
    expect(titles[0]).toBe("Photosynthesis");
    // Widening the bar is not the same as dropping it.
    expect(titles).not.toContain("Full Stack Open");
    expect(titles).not.toContain("GeoGebra Math Apps");
  });

  it("does not let a word about the shape of the answer carry the query", async () => {
    const titles = (
      await searchCatalog({ query: "kinematics projectile motion tutorial" })
    ).map((r) => r.title);

    expect(titles).toContain("Projectile motion");
    expect(titles).toContain("Kinematics");
    // "Tutorial" is not a topic. Fifteen of these came back for this search on
    // the live site, and they were the entire page.
    expect(titles).not.toContain("How To Heat Press A T-Shirt 101 ~ Easy Tutorial");
    expect(titles).not.toContain(
      "Retro Sunset T-Shirt Design Tutorial | Adobe Illustrator",
    );
  });

  it("asks a paper or a video for more than one word in common", async () => {
    const titles = (
      await searchCatalog({ query: "kinematics projectile motion" })
    ).map((r) => r.title);

    // Matching "motion" alone. Every one of these came back from the live site
    // for this search, above works that are actually about the topic.
    expect(titles).not.toContain(
      "Strabismic imaging for correcting in-plane motion distortion in scanning microscopy",
    );
    expect(titles).not.toContain(
      "Quadratic Motion Polynomials with Irregular Factorizations",
    );
    expect(titles).not.toContain("Claude Design FINALLY Solved Motion Graphics");

    // A reference work matching that same single word is kept: its title is a
    // topic name, so the one word is the strongest evidence there is. This is
    // what a flat "two words of everything" rule would have thrown away.
    expect(titles).toContain("Newton's laws of motion");
    expect(titles).toContain("Projectile motion");
    expect(titles).toContain("Kinematics of projectiles");
  });

  it("takes the papers anyway when they are all the catalog has", async () => {
    // Nothing but papers shares a word with this, so the rule has nothing left
    // to keep and an empty page is the worse answer.
    const titles = (
      await searchCatalog({ query: "strabismic polynomials factorizations" })
    ).map((r) => r.title);
    expect(titles).toContain(
      "Quadratic Motion Polynomials with Irregular Factorizations",
    );
  });

  it("never asks a one-word search for two words", async () => {
    // Two is impossible against one, so the rule must not apply at all — this
    // would otherwise empty every single-word search of papers and videos.
    const titles = (await searchCatalog({ query: "hamlet" })).map(
      (r) => r.title,
    );
    expect(titles).toContain("Hamlet and the tragedy of revenge");
  });

  it("will not let a word the catalog is full of answer the question", async () => {
    const titles = await search({ query: "french revolution" });

    expect(titles).toContain("Glossary of the French Revolution");
    // Ten works in this catalog have "revolution" in their title, so matching
    // that word says almost nothing about which one answers the question.
    // Every one of these came back from the live site for this search.
    expect(titles).not.toContain("Russian Revolution");
    expect(titles).not.toContain("American Revolution");
    expect(titles).not.toContain("Industrial Revolution");
  });

  it("lets a word the catalog barely uses answer it alone", async () => {
    // One work mentions the guillotine against ten revolutions, so the word
    // pins the topic by itself — and this is the difference the rule turns on.
    // A rule that simply demanded two matching words would lose this.
    expect(await search({ query: "french revolution guillotine" })).toContain(
      "The guillotine",
    );
  });

  it("asks for both words when neither of them is rare", async () => {
    // Nothing here is distinguishing, so the rule falls back to wanting both —
    // which is the right reading of a two-word question in any case.
    const titles = await search({ query: "physics mechanics" });
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((title) => /physics/i.test(title))).toBe(true);
  });

  it("takes a single common word when it is all the catalog has", async () => {
    // No work matches two words of this and none matches a rare one, so the
    // rule steps aside rather than handing back an empty page.
    expect(await search({ query: "revolution barricades" })).toContain(
      "Russian Revolution",
    );
  });

  it("still judges a query that is nothing but packaging", async () => {
    // Dropping every word would leave no bar at all, so the whole query stands.
    // "Worked problems in physics" is what these workbooks say they are.
    const titles = (await searchCatalog({ query: "worked problems" })).map(
      (r) => r.title,
    );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((title) => title.startsWith("Physics Mechanics"))).toBe(
      true,
    );
  });

  it("keeps a lone abbreviation strict", async () => {
    // "AP" is two letters: appearing somewhere is not a topic, so a high
    // school's article does not become a physics result.
    const titles = (await searchCatalog({ query: "AP" })).map((r) => r.title);
    expect(titles).not.toContain("Horizon High School");
  });

  it("takes more than one value for the filters that are alternatives", async () => {
    // The panel was single-select throughout, which turned the question into the
    // wrong question: a reader who wants something to watch *or* read had to
    // search twice and compare two pages by hand.
    const physicsOrMaths = await searchCatalog({
      query: "physics mechanics",
      subject: "Physics,Mathematics",
    });
    expect(physicsOrMaths.length).toBeGreaterThan(0);
    expect(
      physicsOrMaths.every((row) =>
        ["Physics", "Mathematics"].includes(row.subject ?? ""),
      ),
    ).toBe(true);

    // One value still behaves exactly as it did before lists were accepted.
    const onlyPhysics = await searchCatalog({
      query: "physics mechanics",
      subject: "Physics",
    });
    expect(onlyPhysics.length).toBeGreaterThan(0);
    expect(onlyPhysics.length).toBeLessThanOrEqual(physicsOrMaths.length);
  });

  it("drops the subjects a reader is tired of", async () => {
    const withAstronomy = await searchCatalog({
      query: "astronomy celestial bodies",
      minRelevanceScore: 1,
    });
    expect(withAstronomy.map((r) => r.subject)).toContain("Astronomy");
    const without = await searchCatalog({
      query: "astronomy celestial bodies",
      minRelevanceScore: 1,
      excludeSubjects: "Astronomy",
    });
    expect(without.map((r) => r.subject)).not.toContain("Astronomy");
  });

  it("can insist the topic is what a work is about, not something it mentions", async () => {
    // Chlorophyll is genuinely about photosynthesis and is exactly what the
    // widened one-word bar was added to reach. A reader who wants the works
    // *named* after the topic has to be able to say so.
    const mentions = (await searchCatalog({ query: "photosynthesis" })).map(
      (r) => r.title,
    );
    expect(mentions).toContain("Chlorophyll");

    const titled = (
      await searchCatalog({ query: "photosynthesis", titleOnly: true })
    ).map((r) => r.title);
    expect(titled).toContain("Photosynthesis");
    expect(titled).not.toContain("Chlorophyll");
    expect(titled).not.toContain("Calvin cycle");
  });


  it("makes papers wait their turn on a question that is not asking for research", async () => {
    // Reported from the live site: "hamlet soliloquy folio" came back with six
    // arXiv preprints analysing the play out of sixteen results, ahead of the
    // play itself.
    const titles = (await searchCatalog({ query: "hamlet revenge" })).map(
      (row) => row.title,
    );
    expect(titles).toContain("Hamlet, Prince of Denmark");
    expect(titles).toContain("Hamlet and the tragedy of revenge");
    // Nothing is dropped — the paper is still there, just behind the text.
    expect(titles.indexOf("Hamlet, Prince of Denmark")).toBeLessThan(
      titles.indexOf("Hamlet and the tragedy of revenge"),
    );
  });

  it("leaves papers where they are for a question in a research field", async () => {
    // "chemistry" names a field where a paper is a normal thing to be handed, so
    // the delay must not apply: relevance decides, as it did before.
    const rows = await searchCatalog({ query: "chemistry" });
    const paper = rows.find((row) => row.source === "Europe PMC");
    expect(paper).toBeDefined();
    // Both are equally relevant, so the paper is not pushed behind the book.
    const titles = rows.map((row) => row.title);
    expect(
      Math.abs(
        titles.indexOf("Chemistry of light capture in photosystem II") -
          titles.indexOf("Chemistry of the chlorophyll molecule"),
      ),
    ).toBeLessThanOrEqual(1);
  });

  it("never second-guesses a reader who asked for papers", async () => {
    // An explicit filter is a decision, not a preference to be weighed.
    const rows = await searchCatalog({
      query: "hamlet revenge",
      material: "paper",
    });
    expect(rows.map((row) => row.title)).toEqual([
      "Hamlet and the tragedy of revenge",
    ]);
  });

  it("widens rather than returning nothing when the strict pass finds none", async () => {
    const strict = await searchCatalog({ query: "astronomy celestial bodies" });
    const loose = await searchCatalog({
      query: "astronomy celestial bodies",
      minRelevanceScore: 1,
    });
    expect(strict.length).toBeLessThanOrEqual(loose.length);
    expect(loose.map((r) => r.title)).toContain("General Astronomy");
  });

  it("never puts the same work on a page twice", async () => {
    const { dedupeByWork } = await import("@workspace/resource-identity");
    const page = dedupeByWork(await searchCatalog({ query: AP_QUERY }));

    const urls = page.map((r) => r.url.toLowerCase());
    expect(new Set(urls).size).toBe(urls.length);
    // The book and its print version are one work, and the version with a
    // real description is the one kept.
    const apPhysicsC = page.filter((r) => r.title === "AP Physics C");
    expect(apPhysicsC).toHaveLength(1);
    expect(apPhysicsC[0].description).not.toMatch(/^An open educational work/);
  });

  it("gives a later page results the first page did not have", async () => {
    const options = { query: "physics mechanics", limit: 8 };
    const first = await searchCatalog({
      ...options,
      page: 1,
      ...(await resolveCatalogSearch({ ...options, page: 1 })),
    });
    const second = await searchCatalog({
      ...options,
      page: 2,
      ...(await resolveCatalogSearch({ ...options, page: 2 })),
    });

    expect(first).toHaveLength(8);
    expect(second.length).toBeGreaterThan(0);
    const firstUrls = new Set(first.map((r) => r.url));
    // Every result on page two is new. Overlapping pages were deduplicated
    // away in the client, which is what made "search more" look broken.
    expect(second.every((r) => !firstUrls.has(r.url))).toBe(true);
  });

  it("keeps a later page whole while the catalog is still filling up", async () => {
    // The defect this covers is the reason "search more" felt empty. This
    // endpoint stores works as it finds them, so the result set grows between
    // one page and the next, and a work stored during page two can belong on
    // page one — pushing everything below it down, straight back into a window
    // page one already showed. Measured against the live wikis, a third of every
    // "search more" page was results the reader already had.
    const { db, catalogResourcesTable } = await database();
    const options = { query: "physics mechanics", limit: 8 };

    const first = await searchCatalog({
      ...options,
      ...(await resolveCatalogSearch({ ...options, page: 1 })),
    });
    expect(first).toHaveLength(8);
    const readTo = first.reduce(
      (furthest, row) => ({
        after: row.cursor! > furthest.after ? row.cursor! : furthest.after,
        sinceId: Math.max(furthest.sinceId, row.catalogId!),
      }),
      { after: "", sinceId: 0 },
    );

    // Exactly what a top-up does between two pages: works stored now, ranking
    // at the very top because the query is their title.
    await db.insert(catalogResourcesTable).values(
      ["Physics Mechanics", "Physics Mechanics Explained"].map((title) => ({
        provider: "Wikiversity",
        providerUrl: "https://en.wikiversity.org/",
        externalId: `late:${title}`,
        canonicalUrl: `https://en.wikiversity.org/wiki/${title.replace(/ /g, "_")}`,
        title,
        description: "Stored while the reader was reading.",
        format: "article" as const,
        subject: "Physics",
        gradeLevel: "All levels",
        sourceKind: "curated" as const,
      })),
    );

    const second = await searchCatalog({ ...options, ...readTo });

    // Nothing the reader already had.
    const firstUrls = new Set(first.map((row) => row.url));
    expect(second.filter((row) => firstUrls.has(row.url))).toEqual([]);
    // A full page, not the thin remainder an offset would have left.
    expect(second).toHaveLength(8);
    // The work that now ranks top is offered even though it sits above the point
    // the reader had read to. A cursor on its own buries it for good, which is
    // how paging a cold catalog ended up with each page thinner than the last.
    expect(second.map((row) => row.title)).toContain("Physics Mechanics");

    // And nothing else is lost: paging on reaches every remaining row exactly
    // once, the late arrival included. Compared by link, because the fixture
    // holds one work under two links on purpose.
    const seen = new Set([...first, ...second].map((row) => row.url));
    const titles = new Set([...first, ...second].map((row) => row.title));
    let cursor = [...first, ...second].reduce(
      (furthest, row) => ({
        after: row.cursor! > furthest.after ? row.cursor! : furthest.after,
        sinceId: Math.max(furthest.sinceId, row.catalogId!),
      }),
      { after: "", sinceId: 0 },
    );
    for (let more = 0; more < 4; more += 1) {
      const page = await searchCatalog({ ...options, ...cursor });
      if (!page.length) break;
      for (const row of page) {
        expect(seen.has(row.url)).toBe(false);
        seen.add(row.url);
        titles.add(row.title);
      }
      cursor = page.reduce(
        (furthest, row) => ({
          after: row.cursor! > furthest.after ? row.cursor! : furthest.after,
          sinceId: Math.max(furthest.sinceId, row.catalogId!),
        }),
        cursor,
      );
    }
    expect(titles).toContain("Physics Mechanics Explained");
    expect(titles).toContain("Physics Mechanics Workbook 20");
  });

  it("keeps paging until the catalog is genuinely spent", async () => {
    const options = { query: "physics mechanics", limit: 8 };
    const seen = new Set<string>();
    for (let page = 1; page <= 6; page += 1) {
      const results = await searchCatalog({
        ...options,
        page,
        ...(await resolveCatalogSearch({ ...options, page })),
      });
      for (const row of results) {
        // No page ever repeats a row an earlier page showed.
        expect(seen.has(row.url)).toBe(false);
        seen.add(row.url);
      }
    }
    expect(seen.size).toBeGreaterThan(16);
  });
});
