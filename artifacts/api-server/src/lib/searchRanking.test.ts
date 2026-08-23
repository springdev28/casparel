/**
 * @fileOverview Verification role: exercises Search Ranking.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  inferSearchIntent,
  inferSearchMaterial,
  rankCatalogItems,
  type RankableCatalogItem,
} from "./searchRanking";

function item(
  title: string,
  provider: string,
  overrides: Partial<RankableCatalogItem> = {},
): RankableCatalogItem {
  return {
    title,
    provider,
    canonicalUrl: `https://${provider.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}.example/${encodeURIComponent(title)}`,
    description: `${title} is a detailed educational resource with clear publisher and learning information.`,
    subject: "Physics",
    format: "article",
    author: "Named author",
    license: "CC BY 4.0",
    metadata: { credibility: "established", contentScope: "whole-work" },
    ...overrides,
  };
}

describe("search intent inference", () => {
  it("uses learning intent by default and recognizes intent cues", () => {
    expect(inferSearchIntent("AP Physics C mechanics")).toBe("learn");
    expect(inferSearchIntent("Newton's laws practice problems")).toBe(
      "practice",
    );
    expect(inferSearchIntent("definition of opportunity cost")).toBe(
      "reference",
    );
    expect(inferSearchIntent("CRISPR review paper open access")).toBe(
      "research",
    );
    expect(inferSearchIntent("primary source Treaty of Versailles")).toBe(
      "primary-source",
    );
    expect(inferSearchIntent("kimyasal denge soru çözümü")).toBe("practice");
  });
});

describe("search material classification", () => {
  it("distinguishes direct learning works from references and repositories", () => {
    expect(
      inferSearchMaterial(
        item("AP Physics C Mechanics Course", "Open Courseware"),
      ),
    ).toBe("course");
    expect(
      inferSearchMaterial(
        item("Classical mechanics", "Wikipedia", { format: "article" }),
      ),
    ).toBe("reference");
    expect(
      inferSearchMaterial(
        item("Physics Research Catalogue", "Archive", {
          description: "A searchable database and repository of records.",
        }),
      ),
    ).toBe("repository");
  });
});

describe("learning-intent reranking benchmark", () => {
  const mechanicsCandidates = [
    item("Classical mechanics", "Wikipedia"),
    item("Newton's laws", "Wikipedia"),
    item("Work and energy", "Wikipedia"),
    item("Rotational motion", "Wikipedia"),
    item("AP Physics C Mechanics Course", "Open Courseware", {
      format: "video",
      metadata: { credibility: "academic", contentScope: "whole-work" },
    }),
    item("AP Physics C Mechanics Practice Problems", "Khan Academy", {
      format: "interactive",
    }),
    item("University Physics: Mechanics Textbook", "OpenStax", {
      format: "pdf",
      metadata: { credibility: "academic", contentScope: "whole-work" },
    }),
    item("Mechanics Worked Examples", "Physics Classroom", {
      format: "article",
    }),
    item("Projectile Motion Simulation", "PhET", {
      format: "interactive",
      metadata: { credibility: "institutional", contentScope: "whole-work" },
    }),
    item("AP Mechanics Video Lessons", "Flipping Physics", {
      format: "video",
    }),
    item("Mechanics Concept Lessons", "Physics LibreTexts"),
    item("Forces and Motion Lab", "Concord Consortium", {
      format: "interactive",
    }),
  ];

  it("keeps references and any one provider from dominating a learn query", () => {
    const ranked = rankCatalogItems(mechanicsCandidates, {
      query: "AP Physics C mechanics",
    });
    const topFiveMaterials = ranked.slice(0, 5).map(inferSearchMaterial);
    const topTenProviders = ranked.slice(0, 10).map((candidate) => candidate.provider);
    const wikipediaCount = topTenProviders.filter(
      (provider) => provider === "Wikipedia",
    ).length;

    expect(
      topFiveMaterials.filter((material) => material === "reference").length,
    ).toBeLessThanOrEqual(1);
    expect(wikipediaCount).toBeLessThanOrEqual(2);
    expect(new Set(topTenProviders).size).toBeGreaterThanOrEqual(3);
    expect(ranked.slice(0, 3).map(inferSearchMaterial)).toContain("course");
  });

  it("ranks practice, reference, research, and primary-source material for matching intent", () => {
    const reference = item("Opportunity cost definition", "Wikipedia");
    const practice = item("Opportunity Cost Practice Problems", "Econ Lab", {
      format: "interactive",
    });
    const paper = item("Opportunity Cost: A Review Paper", "Open Journal", {
      description: "A peer reviewed research paper and systematic review.",
      metadata: { credibility: "academic", contentScope: "whole-work" },
    });
    const primary = item("Treaty of Versailles Original Text", "National Archives", {
      description: "A primary source and original historical document.",
      metadata: { credibility: "institutional", contentScope: "whole-work" },
    });
    const pool = [reference, practice, paper, primary];

    expect(
      inferSearchMaterial(
        rankCatalogItems(pool, { query: "opportunity cost practice problems" })[0],
      ),
    ).toBe("practice");
    expect(
      inferSearchMaterial(
        rankCatalogItems(pool, { query: "definition of opportunity cost" })[0],
      ),
    ).toBe("reference");
    expect(
      inferSearchMaterial(
        rankCatalogItems(pool, { query: "opportunity cost review paper" })[0],
      ),
    ).toBe("paper");
    expect(
      inferSearchMaterial(
        rankCatalogItems(pool, { query: "primary source Treaty of Versailles" })[0],
      ),
    ).toBe("primary-source");
  });

  it("retrieves an exact known course and removes URL and same-work duplicates", () => {
    const exact = item("Linear Algebra", "MIT OpenCourseWare", {
      canonicalUrl: "https://ocw.mit.edu/courses/18-06-linear-algebra/",
      format: "video",
    });
    const ranked = rankCatalogItems(
      [
        item("Linear Algebra Reference", "Wikipedia"),
        exact,
        { ...exact, canonicalUrl: `${exact.canonicalUrl}?utm_source=test` },
        { ...exact, canonicalUrl: "https://ocw.mit.edu/courses/18-06-linear-algebra/videos" },
      ],
      { query: "Linear Algebra" },
    );

    expect(ranked[0]).toBe(exact);
    expect(ranked).toHaveLength(2);
  });

  it("supports a material filter without special-casing a query", () => {
    const ranked = rankCatalogItems(mechanicsCandidates, {
      query: "mechanics",
      material: "interactive",
    });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((candidate) => inferSearchMaterial(candidate) === "interactive"))
      .toBe(true);
  });
});
