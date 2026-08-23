/**
 * @fileOverview Search-quality benchmark domain: owns the fixed query corpus, release thresholds, CSV interchange, and human-score evaluation.
 * System connection: benchmark-search.mjs uses these pure helpers so ranking evidence can be tested without a database or network request.
 */

export const SEARCH_BENCHMARK_VERSION = "2026-08-22-v1";

export const SEARCH_BENCHMARK_CASES = Object.freeze([
  { query: "AP Physics C mechanics", expectedIntent: "learn", critical: true },
  { query: "AP Physics C electricity and magnetism", expectedIntent: "learn", critical: true },
  { query: "Newton's laws practice problems", expectedIntent: "practice", critical: false },
  { query: "projectile motion simulation", expectedIntent: "learn", critical: false },
  { query: "calculus chain rule explanation", expectedIntent: "learn", critical: false },
  { query: "integration by parts worked examples", expectedIntent: "practice", critical: false },
  { query: "chemical equilibrium AP Chemistry", expectedIntent: "learn", critical: true },
  { query: "titration curves weak acid strong base", expectedIntent: "learn", critical: false },
  { query: "genetics meiosis high school", expectedIntent: "learn", critical: false },
  { query: "photosynthesis light dependent reactions", expectedIntent: "learn", critical: false },
  { query: "World War I causes high school", expectedIntent: "learn", critical: false },
  { query: "French Revolution primary sources", expectedIntent: "primary-source", critical: false },
  { query: "Hamlet soliloquy analysis", expectedIntent: "learn", critical: false },
  { query: "how to write a thesis statement", expectedIntent: "learn", critical: false },
  { query: "supply and demand economics graph", expectedIntent: "learn", critical: false },
  { query: "CRISPR review paper open access", expectedIntent: "research", critical: false },
  { query: "climate feedback loops peer reviewed", expectedIntent: "research", critical: false },
  { query: "Stanford prison experiment criticisms", expectedIntent: "learn", critical: false },
  { query: "primary source Treaty of Versailles", expectedIntent: "primary-source", critical: false },
  { query: "definition of opportunity cost", expectedIntent: "reference", critical: false },
  { query: "philosopher John Rawls justice overview", expectedIntent: "reference", critical: false },
  { query: "türev konu anlatımı", expectedIntent: "learn", critical: false },
  { query: "elektrik ve manyetizma lise", expectedIntent: "learn", critical: false },
  { query: "hücre bölünmesi mitoz mayoz", expectedIntent: "learn", critical: false },
  { query: "Osmanlı modernleşmesi kaynak", expectedIntent: "learn", critical: false },
  { query: "kimyasal denge soru çözümü", expectedIntent: "practice", critical: false },
  { query: "AP physics", expectedIntent: "learn", critical: true },
  { query: "mechanics", expectedIntent: "learn", critical: false },
  { query: "cells", expectedIntent: "learn", critical: false },
  { query: "python classes", expectedIntent: "learn", critical: false },
  { query: "statistics confidence interval", expectedIntent: "learn", critical: false },
  { query: "linear algebra", expectedIntent: "learn", critical: false },
  { query: "how to study for exams", expectedIntent: "learn", critical: false },
  { query: "climate change", expectedIntent: "learn", critical: false },
  { query: "Shakespeare", expectedIntent: "learn", critical: false },
  { query: "C++ pointers", expectedIntent: "learn", critical: false },
]);

export const SEARCH_BENCHMARK_THRESHOLDS = Object.freeze({
  resultCount: 10,
  distinctProvidersTop10: 3,
  maxProviderCountTop10: 4,
  maxReferencesTop5ForLearn: 1,
  meaningfulPreviewCoverage: 0.7,
  usefulPrecisionAt5: 0.8,
});

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function largestCount(counts) {
  return Math.max(0, ...counts.values());
}

/** Evaluate objective properties of one captured top-10 result set. */
export function evaluateAutomatedResult(
  rawResults,
  benchmarkCase,
  inferredIntent,
) {
  const results = rawResults.slice(0, 10);
  const providers = results.map((result) => result.source || "Unknown");
  const materials = results.map((result) => result.material || "unknown");
  const providerCountsTop5 = countBy(providers.slice(0, 5));
  const providerCountsTop10 = countBy(providers);
  const referenceTop5 = materials
    .slice(0, 5)
    .filter((material) => material === "reference").length;
  const repositoryTop5 = materials
    .slice(0, 5)
    .filter((material) => material === "repository").length;
  const previewCoverage = results.length
    ? results.filter((result) => result.previewMeaningful === true).length /
      results.length
    : 0;
  const gates = {
    intent: inferredIntent === benchmarkCase.expectedIntent,
    resultCount: results.length >= SEARCH_BENCHMARK_THRESHOLDS.resultCount,
    providerDiversity:
      new Set(providers).size >=
      SEARCH_BENCHMARK_THRESHOLDS.distinctProvidersTop10,
    providerConcentration:
      largestCount(providerCountsTop10) <=
      SEARCH_BENCHMARK_THRESHOLDS.maxProviderCountTop10,
    referenceConcentration:
      benchmarkCase.expectedIntent !== "learn" ||
      referenceTop5 <=
        SEARCH_BENCHMARK_THRESHOLDS.maxReferencesTop5ForLearn,
    criticalTop3:
      !benchmarkCase.critical ||
      materials.slice(0, 3).every((material) => material !== "repository"),
    meaningfulPreviewCoverage:
      previewCoverage >=
      SEARCH_BENCHMARK_THRESHOLDS.meaningfulPreviewCoverage,
  };

  return {
    query: benchmarkCase.query,
    expectedIntent: benchmarkCase.expectedIntent,
    inferredIntent,
    resultCount: results.length,
    distinctProviders: new Set(providers).size,
    maxProviderCountTop5: largestCount(providerCountsTop5),
    maxProviderCountTop10: largestCount(providerCountsTop10),
    referenceTop5,
    repositoryTop5,
    previewCoverage: Number(previewCoverage.toFixed(2)),
    gates,
    passed: Object.values(gates).every(Boolean),
    reviewCandidates: results.map((result, index) => ({
      rank: index + 1,
      title: result.title,
      url: result.url,
      provider: result.source || "Unknown",
      material: result.material || "unknown",
    })),
  };
}

const REVIEW_COLUMNS = Object.freeze([
  "query",
  "expected_intent",
  "rank",
  "title",
  "url",
  "provider",
  "material",
  "topical_relevance_0_3",
  "pedagogical_usefulness_0_3",
  "directness_0_2",
  "trust_transparency_0_2",
  "reviewer_notes",
]);

function csvCell(value) {
  const text = String(value ?? "");
  // A review sheet will commonly be opened in Excel/Sheets. Prefix formula
  // leaders so a provider-controlled title cannot execute as a spreadsheet
  // formula when the CSV is opened.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function humanReviewCsv(benchmarkRows) {
  const lines = [REVIEW_COLUMNS.map(csvCell).join(",")];
  for (const row of benchmarkRows) {
    for (const candidate of row.reviewCandidates ?? []) {
      lines.push(
        [
          row.query,
          row.expectedIntent,
          candidate.rank,
          candidate.title,
          candidate.url,
          candidate.provider,
          candidate.material,
          "",
          "",
          "",
          "",
          "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Parse RFC-4180-style CSV, including commas, escaped quotes, and line breaks. */
export function parseCsv(text) {
  const records = [];
  let record = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(cell);
      cell = "";
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("Review CSV ends inside a quoted cell.");
  if (cell || record.length) {
    record.push(cell);
    if (record.some((value) => value !== "")) records.push(record);
  }
  if (!records.length) throw new Error("Review CSV is empty.");

  const [headers, ...rows] = records;
  const missing = REVIEW_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) {
    throw new Error(`Review CSV is missing columns: ${missing.join(", ")}`);
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error("Review CSV contains duplicate column names.");
  }
  return rows.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(
        `Review CSV row ${rowIndex + 2} has ${values.length} cells; expected ${headers.length}.`,
      );
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function rubricScore(row, column, maximum, errors) {
  const raw = row[column]?.trim();
  const score = Number(raw);
  if (raw === "" || !Number.isInteger(score) || score < 0 || score > maximum) {
    errors.push(
      `${row.query || "Unknown query"} rank ${row.rank || "?"}: ${column} must be an integer from 0 to ${maximum}.`,
    );
    return null;
  }
  return score;
}

/**
 * Turn completed human rubric rows into the section-7 release decision.
 * Scores are never inferred from titles or providers: usefulness is a human
 * judgment, and incomplete sheets remain INCOMPLETE rather than passing.
 */
export function evaluateHumanReview(
  rows,
  cases = SEARCH_BENCHMARK_CASES,
) {
  const expectedCases = new Map(cases.map((entry) => [entry.query, entry]));
  const grouped = new Map(cases.map((entry) => [entry.query, new Map()]));
  const errors = [];

  for (const row of rows) {
    const benchmarkCase = expectedCases.get(row.query);
    if (!benchmarkCase) {
      errors.push(`Unknown benchmark query: ${row.query || "(blank)"}.`);
      continue;
    }
    if (row.expected_intent !== benchmarkCase.expectedIntent) {
      errors.push(
        `${row.query}: expected_intent must remain ${benchmarkCase.expectedIntent}.`,
      );
    }
    const rank = Number(row.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
      errors.push(`${row.query}: rank must be an integer from 1 to 10.`);
      continue;
    }
    const queryRows = grouped.get(row.query);
    if (queryRows.has(rank)) {
      errors.push(`${row.query}: duplicate rank ${rank}.`);
      continue;
    }
    queryRows.set(rank, {
      rank,
      topical: rubricScore(row, "topical_relevance_0_3", 3, errors),
      usefulness: rubricScore(row, "pedagogical_usefulness_0_3", 3, errors),
      directness: rubricScore(row, "directness_0_2", 2, errors),
      trust: rubricScore(row, "trust_transparency_0_2", 2, errors),
    });
  }

  for (const benchmarkCase of cases) {
    const queryRows = grouped.get(benchmarkCase.query);
    for (let rank = 1; rank <= 10; rank += 1) {
      if (!queryRows.has(rank)) {
        errors.push(`${benchmarkCase.query}: missing review for rank ${rank}.`);
      }
    }
  }

  const queryResults = [];
  let usefulTop5 = 0;
  let top5Count = 0;
  let criticalIrrelevantTop3 = 0;
  const totals = { topical: 0, usefulness: 0, directness: 0, trust: 0 };
  let scoredCount = 0;

  for (const benchmarkCase of cases) {
    const ranked = [...grouped.get(benchmarkCase.query).values()].sort(
      (left, right) => left.rank - right.rank,
    );
    const complete =
      ranked.length === 10 &&
      ranked.every((row) =>
        [row.topical, row.usefulness, row.directness, row.trust].every(
          (score) => score !== null,
        ),
      );
    const top5 = ranked.filter((row) => row.rank <= 5 && row.usefulness !== null);
    const queryUseful = top5.filter((row) => row.usefulness >= 2).length;
    usefulTop5 += queryUseful;
    top5Count += top5.length;
    const irrelevantTop3 = benchmarkCase.critical
      ? ranked.filter((row) => row.rank <= 3 && row.topical === 0).length
      : 0;
    criticalIrrelevantTop3 += irrelevantTop3;
    for (const row of ranked) {
      if ([row.topical, row.usefulness, row.directness, row.trust].some((score) => score === null))
        continue;
      totals.topical += row.topical;
      totals.usefulness += row.usefulness;
      totals.directness += row.directness;
      totals.trust += row.trust;
      scoredCount += 1;
    }
    queryResults.push({
      query: benchmarkCase.query,
      complete,
      precisionAt5: top5.length === 5 ? Number((queryUseful / 5).toFixed(2)) : null,
      criticalIrrelevantTop3: irrelevantTop3,
    });
  }

  const precisionAt5 =
    top5Count === cases.length * 5
      ? Number((usefulTop5 / top5Count).toFixed(3))
      : null;
  const averages = scoredCount
    ? {
        topical: Number((totals.topical / scoredCount).toFixed(2)),
        usefulness: Number((totals.usefulness / scoredCount).toFixed(2)),
        directness: Number((totals.directness / scoredCount).toFixed(2)),
        trust: Number((totals.trust / scoredCount).toFixed(2)),
      }
    : null;
  const status = errors.length
    ? "INCOMPLETE"
    : precisionAt5 >= SEARCH_BENCHMARK_THRESHOLDS.usefulPrecisionAt5 &&
        criticalIrrelevantTop3 === 0
      ? "PASS"
      : "FAIL-CONFIRMED";

  return {
    corpusVersion: SEARCH_BENCHMARK_VERSION,
    status,
    thresholds: {
      usefulPrecisionAt5: SEARCH_BENCHMARK_THRESHOLDS.usefulPrecisionAt5,
      criticalIrrelevantTop3: 0,
    },
    precisionAt5,
    usefulTop5,
    top5Count,
    criticalIrrelevantTop3,
    averages,
    errors,
    queryResults,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

/** Aggregate only successful HTTP measurements; transport failures stay separate. */
export function summarizeAutomatedRows(rows) {
  const measured = rows.filter((row) => Number.isInteger(row.resultCount));
  const failedRequests = rows.length - measured.length;
  const ratio = (count) =>
    measured.length ? Number((count / measured.length).toFixed(3)) : null;
  const average = (values) =>
    values.length
      ? Number(
          (values.reduce((total, value) => total + value, 0) / values.length).toFixed(
            3,
          ),
        )
      : null;

  return {
    queryCount: rows.length,
    measuredQueryCount: measured.length,
    failedRequestCount: failedRequests,
    noResultRate: ratio(
      measured.filter((row) => row.resultCount === 0).length,
    ),
    medianDistinctProvidersTop10: median(
      measured.map((row) => row.distinctProviders),
    ),
    maxSameProviderTop5: Math.max(
      0,
      ...measured.map((row) => row.maxProviderCountTop5),
    ),
    maxSameProviderTop10: Math.max(
      0,
      ...measured.map((row) => row.maxProviderCountTop10),
    ),
    archiveContainerTop5: measured.reduce(
      (total, row) => total + row.repositoryTop5,
      0,
    ),
    meanMeaningfulPreviewCoverage: average(
      measured.map((row) => row.previewCoverage),
    ),
  };
}

/** Transport/configuration gaps cannot be interpreted as ranking evidence. */
export function classifyAutomatedRun(rows) {
  if (rows.some((row) => !Number.isInteger(row.resultCount))) {
    return "BLOCKED-EXTERNAL";
  }
  return rows.every((row) => row.passed) ? "PASS" : "FAIL-CONFIRMED";
}
