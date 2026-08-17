/**
 * What a reader gets back, checked against a real Postgres.
 *
 * These cover the complaints that a mocked database cannot see, because they
 * live in what the SQL actually matches and in how the endpoint assembles a
 * page: unrelated results, the same work more than once, and a "search more"
 * that returns almost nothing.
 *
 * CI has no database, so they skip unless one is provided:
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run src/searchQuality.db.test.ts
 *
 * The catalog table is emptied, so point this at a throwaway database.
 */
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.VERIFY_DATABASE_URL;

type Row = {
  title: string;
  provider: string;
  url: string;
  description: string;
  subject: string;
  sourceKind?: "curated" | "wikibooks" | "wikipedia" | "wikiversity";
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
  {
    title: "Full Stack Open",
    provider: "University of Helsinki",
    url: "https://fullstackopen.com/en/",
    description:
      "A project-based course in modern JavaScript web development with React, Node.js and APIs.",
    subject: "Computer Science",
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

describe.skipIf(!url)("search quality against a real database", () => {
  let searchCatalog: typeof import("./lib/catalog").searchCatalog;
  let resolveCatalogSearch: typeof import("./lib/catalog").resolveCatalogSearch;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { db, catalogResourcesTable, runMigrations } = await import(
      "@workspace/db"
    );
    await runMigrations();
    await db.delete(catalogResourcesTable);
    await db.insert(catalogResourcesTable).values(
      [...ROWS, ...fillerRows(20)].map((row) => ({
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
      })),
    );
    ({ searchCatalog, resolveCatalogSearch } = await import("./lib/catalog"));
  }, 60_000);

  const QUERY = "AP Physics C: Electricity and Mechanics";

  it("answers only with works that match more than one word of the query", async () => {
    const titles = (await searchCatalog({ query: QUERY })).map((r) => r.title);

    expect(titles).toContain("AP Physics C: Mechanics");
    expect(titles).toContain("AP Physics C: Electricity and Magnetism");
    // One word of four is a coincidence, not a match.
    expect(titles).not.toContain("Horizon High School");
    expect(titles).not.toContain("General Astronomy");
    expect(titles).not.toContain("GeoGebra Math Apps");
    expect(titles).not.toContain("Full Stack Open");
  });

  it("ranks a work matching more of the query higher", async () => {
    const titles = (await searchCatalog({ query: QUERY })).map((r) => r.title);
    expect(titles.indexOf("AP Physics C: Mechanics")).toBeLessThan(
      titles.indexOf("AP Physics B"),
    );
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
    const { dedupeResults } = await import("./lib/resultDedupe");
    const page = dedupeResults(await searchCatalog({ query: QUERY }));

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
