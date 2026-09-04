import { describe, expect, it } from "vitest";
import {
  matchesNormalizedResourceFilters,
  normalizeResourceMetadata,
  type NormalizableResource,
} from "./catalogNormalization";
import {
  filterRankAndDedupeDiscovery,
  type DiscoveryCandidate,
  type DiscoveryFilterOptions,
} from "./discoverySearch";

const matches = (
  item: NormalizableResource,
  filters: Parameters<typeof matchesNormalizedResourceFilters>[1],
) => matchesNormalizedResourceFilters(item, filters);

describe("catalog metadata normalization", () => {
  it("maps AP Physics C wording variants to one subject, course, and level", () => {
    const variants = [
      "AP Physics C: Electricity and Magnetism",
      "AP Physics C E&M",
      "Electricity & Magnetism",
      "Electromagnetism",
    ];

    for (const title of variants) {
      const metadata = normalizeResourceMetadata({ title });
      expect(metadata.subjects).toContain("physics");
      expect(metadata.courses).toContain(
        "ap-physics-c-electricity-and-magnetism",
      );
      expect(metadata.courses).toContain("ap-physics-c");
    }

    expect(
      normalizeResourceMetadata({ title: variants[0] }).gradeBands,
    ).toContain("high-school");
    expect(
      normalizeResourceMetadata({ title: variants[0] }).difficulties,
    ).toContain("advanced");
  });

  it("keeps specific AP Physics C branches distinct beneath the shared course", () => {
    const mechanics = {
      title: "AP Physics C: Mechanics",
      subject: "Physics",
    };

    expect(
      matches(mechanics, { query: "AP Physics C: Electricity and Magnetism" }),
    ).toBe(false);
    expect(matches(mechanics, { query: "", course: "AP Physics C E&M" })).toBe(
      false,
    );
    expect(matches(mechanics, { query: "AP Physics C" })).toBe(true);
  });

  it("normalizes every filterable metadata dimension", () => {
    const metadata = normalizeResourceMetadata({
      title: "AP Physics C E&M downloadable textbook",
      url: "https://ocw.mit.edu/courses/physics-em",
      format: "ebook",
      source: "MIT OCW",
      subject: "Physical Sciences",
      gradeLevel: "Grades 9–12",
      language: "English (US)",
      difficulty: "Advanced Placement",
      license: "Creative Commons Attribution-NonCommercial-ShareAlike 4.0",
      accessType: "free with no account",
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        subjects: expect.arrayContaining(["physics"]),
        courses: expect.arrayContaining([
          "ap-physics-c",
          "ap-physics-c-electricity-and-magnetism",
        ]),
        gradeBands: expect.arrayContaining(["high-school"]),
        formats: expect.arrayContaining(["pdf"]),
        languages: expect.arrayContaining(["en"]),
        difficulties: expect.arrayContaining(["advanced"]),
        providers: expect.arrayContaining(["mit-opencourseware"]),
        licenses: expect.arrayContaining(["cc-by-nc-sa"]),
        accessTypes: expect.arrayContaining(["open"]),
      }),
    );
  });

  it("treats all-level and multilingual resources as compatible wildcards", () => {
    const allLevels = {
      title: "World history for everyone",
      subject: "History",
      gradeLevel: "All Ages",
      language: "multiple languages",
    };

    for (const gradeLevel of [
      "K–5",
      "middle school",
      "9th grade",
      "College",
      "Adult",
    ]) {
      expect(matches(allLevels, { gradeLevel })).toBe(true);
    }
    for (const language of ["English", "Spanish", "Turkish", "German"]) {
      expect(matches(allLevels, { language })).toBe(true);
    }
  });
});

describe("one normalized engine for stored and live results", () => {
  const storedPhysics: DiscoveryCandidate = {
    title: "Electricity & Magnetism",
    url: "https://ocw.mit.edu/courses/electricity-magnetism",
    description: "Advanced Placement course notes and problem sets.",
    format: "pdf",
    source: "MIT OpenCourseWare",
    subject: "Physical Science",
    gradeLevel: "Upper secondary",
    language: "en",
    difficulty: "advanced",
    accessType: "open",
    license: "CC BY-NC-SA 4.0",
  };

  const livePhysics: DiscoveryCandidate = {
    title: "AP Physics C E&M review packet",
    url: "https://teacher.example.edu/ap-physics-c-em.pdf",
    description: "Electricity and magnetism practice for AP students.",
    format: "pdf",
    source: "Example University",
    subject: "Physics",
    gradeLevel: "Grades 9–12",
    language: "English",
    difficulty: "Advanced Placement",
    accessType: "open",
    license: "Creative Commons Attribution 4.0",
  };

  const unrelated: DiscoveryCandidate[] = [
    {
      title: "Biology 2e",
      url: "https://openstax.org/books/biology-2e",
      description: "A general biology textbook.",
      format: "pdf",
      source: "OpenStax",
      subject: "Biology",
      gradeLevel: "College",
      language: "en",
      difficulty: "intermediate",
      accessType: "open",
      license: "CC BY 4.0",
    },
    {
      title: "Historia mundial",
      url: "https://example.es/historia",
      description: "Una lección de historia.",
      format: "article",
      source: "Example ES",
      subject: "History",
      gradeLevel: "Middle school",
      language: "es",
      difficulty: "beginner",
      accessType: "open",
      license: "Public domain",
    },
  ];

  const physicsFilters: DiscoveryFilterOptions = {
    query: "AP Physics C: Electricity and Magnetism",
    subject: "Physics",
    course: "AP Physics C E&M",
    gradeLevel: "AP / high school",
    format: "pdf",
    language: "English",
    difficulty: "advanced",
    accessType: "no_account",
    license: "reusable",
  };

  it("keeps an initially displayed AP Physics C resource after every valid filter", () => {
    expect(
      filterRankAndDedupeDiscovery([storedPhysics, ...unrelated], {
        query: physicsFilters.query,
      }).map((item) => item.url),
    ).toContain(storedPhysics.url);

    const individualFilters: DiscoveryFilterOptions[] = [
      { query: physicsFilters.query, subject: physicsFilters.subject },
      { query: physicsFilters.query, course: physicsFilters.course },
      { query: physicsFilters.query, gradeLevel: physicsFilters.gradeLevel },
      { query: physicsFilters.query, format: physicsFilters.format },
      { query: physicsFilters.query, language: physicsFilters.language },
      { query: physicsFilters.query, difficulty: physicsFilters.difficulty },
      { query: physicsFilters.query, accessType: physicsFilters.accessType },
      { query: physicsFilters.query, license: physicsFilters.license },
    ];

    for (const filter of individualFilters) {
      expect(
        filterRankAndDedupeDiscovery(
          [storedPhysics, livePhysics, ...unrelated],
          filter,
        ).map((item) => item.url),
      ).toContain(storedPhysics.url);
    }

    expect(
      filterRankAndDedupeDiscovery(
        [storedPhysics, livePhysics, ...unrelated],
        physicsFilters,
      ).map((item) => item.url),
    ).toEqual(expect.arrayContaining([storedPhysics.url, livePhysics.url]));
  });

  it("returns exact matching sets for unrelated individual and combined filters", () => {
    const algebra: DiscoveryCandidate = {
      title: "Algebra 1 practice",
      url: "https://khanacademy.org/math/algebra-one",
      description: "Introductory equations and interactive exercises.",
      format: "interactive",
      source: "KhanAcademy.org",
      subject: "Maths",
      gradeLevel: "6–8",
      language: "Spanish",
      difficulty: "beginner",
      accessType: "free-account",
      license: "Provider terms apply",
    };
    const history: DiscoveryCandidate = {
      title: "Primary sources in world history",
      url: "https://loc.gov/classroom-materials/world-history",
      description: "An article collection for all ages.",
      format: "article",
      source: "Library of Congress",
      subject: "History",
      gradeLevel: "All levels",
      language: "tr",
      difficulty: "mixed",
      accessType: "open",
      license: "Public domain",
    };
    const chemistry: DiscoveryCandidate = {
      title: "Organic Chemistry audio course",
      url: "https://university.example.de/organic-chemistry-audio",
      description: "University-level reaction mechanisms.",
      format: "podcast",
      source: "Example Universität",
      subject: "Chemical Science",
      gradeLevel: "Higher education",
      language: "de",
      difficulty: "intermediate",
      accessType: "open",
      license: "CC BY-SA 4.0",
    };
    const resources = [algebra, history, chemistry];
    const urls = (filters: DiscoveryFilterOptions) =>
      filterRankAndDedupeDiscovery(resources, filters)
        .map((item) => item.url)
        .sort();

    expect(urls({ query: "", subject: "mathematics" })).toEqual([algebra.url]);
    expect(urls({ query: "", course: "Algebra I" })).toEqual([algebra.url]);
    expect(urls({ query: "", gradeLevel: "middle school" })).toEqual([
      algebra.url,
      history.url,
    ]);
    expect(urls({ query: "", language: "Turkish" })).toEqual([history.url]);
    expect(urls({ query: "", format: "podcast" })).toEqual([chemistry.url]);
    expect(urls({ query: "", difficulty: "introductory" })).toEqual([
      algebra.url,
      history.url,
    ]);
    expect(urls({ query: "", source: "Khan Academy" })).toEqual([algebra.url]);
    expect(urls({ query: "", license: "reusable" })).toEqual([
      history.url,
      chemistry.url,
    ]);
    expect(
      urls({
        query: "Algebra",
        subject: "Math",
        course: "Algebra 1",
        gradeLevel: "Grades 6–8",
        language: "es",
        format: "interactive",
        difficulty: "beginner",
        source: "khanacademy.org",
        accessType: "free",
        license: "known",
      }),
    ).toEqual([algebra.url]);
  });

  it("keeps specific multi-word searches strict while resolving aliases", () => {
    const candidates: DiscoveryCandidate[] = [
      {
        title: "Projectile motion tutorial",
        url: "https://physics.example.edu/projectile-motion",
        description: "A physics lesson about trajectories.",
        format: "article",
        source: "Example University",
        subject: "Physics",
      },
      {
        title: "Heat press T-shirt tutorial",
        url: "https://craft.example/tutorial",
        description: "A printing demonstration.",
        format: "video",
        source: "Example Creator",
        subject: "Arts",
      },
      {
        title: "Horizon High School",
        url: "https://school.example/about",
        description: "Information about AP courses.",
        format: "article",
        source: "Horizon High School",
        subject: "General Education",
      },
    ];

    expect(
      filterRankAndDedupeDiscovery(candidates, {
        query: "projectile motion tutorial",
      }).map((item) => item.title),
    ).toEqual(["Projectile motion tutorial"]);
    expect(
      filterRankAndDedupeDiscovery(candidates, { query: "AP" }).map(
        (item) => item.title,
      ),
    ).not.toContain("Horizon High School");
  });
});
