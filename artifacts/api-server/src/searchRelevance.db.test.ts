/**
 * Search relevance, checked against a real Postgres.
 *
 * The defect these cover is invisible to a mocked database: it lives in what
 * `~*` and `ILIKE` actually match. Searching "AP Physics C: Electricity and
 * Mechanics" returned a full-stack web development roadmap, because the query
 * is tokenised, the tokens are OR-ed, and `%AP%` matches inside "roadmAP".
 *
 * CI has no database, so these skip unless one is provided. Every other test
 * in this package mocks the database and must keep doing so.
 *
 *   VERIFY_DATABASE_URL=postgres://…/throwaway \
 *     pnpm --filter @workspace/api-server exec vitest run src/searchRelevance.db.test.ts
 *
 * The database is emptied of catalog rows, resources and users, so point this
 * at a throwaway one.
 */
import { describe, expect, it } from "vitest";

const url = process.env.VERIFY_DATABASE_URL;

describe.skipIf(!url)("search relevance against a real database", () => {
  it("does not answer an AP Physics search with a full-stack roadmap", async () => {
    process.env.DATABASE_URL = url;
    const { db, catalogResourcesTable } = await import("@workspace/db");
    const { runMigrations } = await import("@workspace/db");
    await runMigrations();
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
        description: "Electricity, magnetism and mechanics for calculus-based courses.",
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
      // Both of these came back from the live site for the AP Physics search
      // after the word-start fix: "AP" opens "Apps" and "APIs" too.
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

    const { searchCatalog } = await import("./lib/catalog");
    const results = await searchCatalog({
      query: "AP Physics C: Electricity and Mechanics",
    });
    const titles = results.map((r) => r.title);
    console.log("RESULTS:", titles);

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

    // A prefix still matches a whole word, and punctuation cannot break the
    // regex the pattern is compiled into.
    expect(
      (await searchCatalog({ query: "physic" })).map((r) => r.subject),
    ).toContain("Physics");
    await expect(searchCatalog({ query: "C++" })).resolves.toBeInstanceOf(Array);
  }, 60_000);

  it("does not answer an AP Physics library search with a full-stack roadmap", async () => {
    process.env.DATABASE_URL = url;
    const { db, resourcesTable, usersTable, runMigrations } =
      await import("@workspace/db");
    await runMigrations();
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

    const express = (await import("express")).default;
    const request = (await import("supertest")).default;
    const { default: resourcesRouter } = await import("./routes/resources.js");
    const app = express();
    app.use(express.json());
    app.use("/api", resourcesRouter);

    const res = await request(app)
      .get("/api/resources")
      .query({ q: "AP Physics C: Electricity and Mechanics" });
    const titles = (res.body as { title: string }[]).map((r) => r.title);
    console.log("LIBRARY RESULTS:", titles);

    expect(res.status).toBe(200);
    expect(titles).toEqual(["Classical Mechanics"]);
  }, 60_000);
});
