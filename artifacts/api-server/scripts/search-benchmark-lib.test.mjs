/**
 * @fileOverview Verification role: proves the search benchmark corpus, CSV safety, completeness checks, and human release-gate arithmetic.
 * System connection: runs in the API Vitest suite without network/database access so benchmark tooling cannot silently overstate search quality.
 */
import { describe, expect, it } from "vitest";
import {
  SEARCH_BENCHMARK_CASES,
  SEARCH_BENCHMARK_VERSION,
  classifyAutomatedRun,
  evaluateAutomatedResult,
  evaluateHumanReview,
  humanReviewCsv,
  parseCsv,
  summarizeAutomatedRows,
} from "./search-benchmark-lib.mjs";

function completedRows(overrides = new Map()) {
  return SEARCH_BENCHMARK_CASES.flatMap((benchmarkCase) =>
    Array.from({ length: 10 }, (_, index) => {
      const rank = index + 1;
      const override = overrides.get(`${benchmarkCase.query}:${rank}`) ?? {};
      return {
        query: benchmarkCase.query,
        expected_intent: benchmarkCase.expectedIntent,
        rank: String(rank),
        topical_relevance_0_3: "3",
        pedagogical_usefulness_0_3: "3",
        directness_0_2: "2",
        trust_transparency_0_2: "2",
        ...override,
      };
    }),
  );
}

describe("search benchmark corpus", () => {
  it("contains the complete unique 36-query section-7 starting set", () => {
    expect(SEARCH_BENCHMARK_CASES).toHaveLength(36);
    expect(SEARCH_BENCHMARK_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
    expect(new Set(SEARCH_BENCHMARK_CASES.map((entry) => entry.query)).size).toBe(36);
    expect(SEARCH_BENCHMARK_CASES.some((entry) => entry.query === "türev konu anlatımı")).toBe(true);
    expect(SEARCH_BENCHMARK_CASES.some((entry) => entry.query === "C++ pointers")).toBe(true);
  });
});

describe("objective search gates", () => {
  it("measures diversity, concentration, previews, reference and archive counts", () => {
    const results = Array.from({ length: 10 }, (_, index) => ({
      title: `Result ${index + 1}`,
      url: `https://example.com/${index + 1}`,
      source: ["Provider A", "Provider B", "Provider C", "Provider D"][
        index % 4
      ],
      material: index === 4 ? "reference" : index === 5 ? "repository" : "course",
      previewMeaningful: index < 7,
    }));
    const evaluation = evaluateAutomatedResult(
      results,
      SEARCH_BENCHMARK_CASES[0],
      "learn",
    );
    expect(evaluation.passed).toBe(true);
    expect(evaluation).toMatchObject({
      resultCount: 10,
      distinctProviders: 4,
      maxProviderCountTop5: 2,
      maxProviderCountTop10: 3,
      referenceTop5: 1,
      repositoryTop5: 0,
      previewCoverage: 0.7,
    });
  });

  it("fails thin, concentrated, preview-poor critical results", () => {
    const evaluation = evaluateAutomatedResult(
      Array.from({ length: 5 }, (_, index) => ({
        title: `Archive ${index}`,
        url: `https://archive.example/${index}`,
        source: "One Provider",
        material: index < 3 ? "repository" : "reference",
        previewMeaningful: false,
      })),
      SEARCH_BENCHMARK_CASES[0],
      "reference",
    );
    expect(evaluation.passed).toBe(false);
    expect(Object.values(evaluation.gates).every((gate) => gate === false)).toBe(
      true,
    );
  });
});

describe("search human-review CSV", () => {
  it("round-trips commas, quotes, newlines, and spreadsheet formula leaders", () => {
    const csv = humanReviewCsv([
      {
        query: "mechanics",
        expectedIntent: "learn",
        reviewCandidates: [
          {
            rank: 1,
            title: '=LINK("bad", "title")',
            url: "https://example.com/a,b",
            provider: 'Provider "One"\nLearning',
            material: "course",
          },
        ],
      },
    ]);
    const [row] = parseCsv(csv);
    expect(row.title.startsWith("'=")).toBe(true);
    expect(row.url).toBe("https://example.com/a,b");
    expect(row.provider).toBe('Provider "One"\nLearning');
  });

  it("rejects an incomplete review instead of calculating a misleading pass", () => {
    const rows = completedRows();
    rows.pop();
    const result = evaluateHumanReview(rows);
    expect(result.status).toBe("INCOMPLETE");
    expect(result.errors.some((error) => error.includes("missing review for rank 10"))).toBe(true);
  });
});

describe("automated search summary", () => {
  it("separates transport failures and reports the section-7 aggregate metrics", () => {
    const summary = summarizeAutomatedRows([
      {
        resultCount: 10,
        distinctProviders: 4,
        maxProviderCountTop5: 2,
        maxProviderCountTop10: 4,
        repositoryTop5: 1,
        previewCoverage: 0.8,
      },
      {
        resultCount: 0,
        distinctProviders: 0,
        maxProviderCountTop5: 0,
        maxProviderCountTop10: 0,
        repositoryTop5: 0,
        previewCoverage: 0,
      },
      { status: 503, passed: false },
    ]);
    expect(summary).toMatchObject({
      queryCount: 3,
      measuredQueryCount: 2,
      failedRequestCount: 1,
      noResultRate: 0.5,
      medianDistinctProvidersTop10: 2,
      maxSameProviderTop5: 2,
      maxSameProviderTop10: 4,
      archiveContainerTop5: 1,
      meanMeaningfulPreviewCoverage: 0.4,
    });
  });

  it("does not misreport transport/configuration failures as ranking failures", () => {
    expect(classifyAutomatedRun([{ status: 0, passed: false }])).toBe(
      "BLOCKED-EXTERNAL",
    );
    expect(
      classifyAutomatedRun([{ resultCount: 10, passed: false }]),
    ).toBe("FAIL-CONFIRMED");
    expect(classifyAutomatedRun([{ resultCount: 10, passed: true }])).toBe(
      "PASS",
    );
  });
});

describe("search human-review release gate", () => {
  it("passes complete reviews at or above 80% useful Precision@5", () => {
    const overrides = new Map();
    // Exactly 36 of 180 top-five results are below useful, leaving 80% useful.
    for (let index = 0; index < 36; index += 1) {
      overrides.set(`${SEARCH_BENCHMARK_CASES[index].query}:5`, {
        pedagogical_usefulness_0_3: "1",
      });
    }
    const result = evaluateHumanReview(completedRows(overrides));
    expect(result.status).toBe("PASS");
    expect(result.precisionAt5).toBe(0.8);
  });

  it("fails below 80% and fails an obviously irrelevant critical top-three result", () => {
    const belowThreshold = new Map();
    for (let index = 0; index < 37; index += 1) {
      const benchmarkCase = SEARCH_BENCHMARK_CASES[index % SEARCH_BENCHMARK_CASES.length];
      const rank = Math.floor(index / SEARCH_BENCHMARK_CASES.length) + 4;
      belowThreshold.set(`${benchmarkCase.query}:${rank}`, {
        pedagogical_usefulness_0_3: "1",
      });
    }
    const precisionResult = evaluateHumanReview(completedRows(belowThreshold));
    expect(precisionResult.status).toBe("FAIL-CONFIRMED");
    expect(precisionResult.precisionAt5).toBeLessThan(0.8);

    const critical = SEARCH_BENCHMARK_CASES.find((entry) => entry.critical);
    const relevanceResult = evaluateHumanReview(
      completedRows(
        new Map([
          [`${critical.query}:1`, { topical_relevance_0_3: "0" }],
        ]),
      ),
    );
    expect(relevanceResult.status).toBe("FAIL-CONFIRMED");
    expect(relevanceResult.criticalIrrelevantTop3).toBe(1);
  });
});
