#!/usr/bin/env node
/**
 * @fileOverview API support role: configures or operates the Benchmark Search part of the backend package.
 * System connection: participates in the API package's development, build, validation, or deployment lifecycle.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEARCH_BENCHMARK_CASES,
  SEARCH_BENCHMARK_THRESHOLDS,
  SEARCH_BENCHMARK_VERSION,
  classifyAutomatedRun,
  evaluateAutomatedResult,
  evaluateHumanReview,
  humanReviewCsv,
  parseCsv,
  summarizeAutomatedRows,
} from "./search-benchmark-lib.mjs";

const validateOnly = process.argv.includes("--validate");
const reviewFlagIndex = process.argv.findIndex(
  (argument) => argument === "--review" || argument.startsWith("--review="),
);
const reviewArgument =
  reviewFlagIndex === -1
    ? null
    : process.argv[reviewFlagIndex].includes("=")
      ? process.argv[reviewFlagIndex].slice(
          process.argv[reviewFlagIndex].indexOf("=") + 1,
        )
      : process.argv[reviewFlagIndex + 1];
const reviewPath = reviewArgument ?? process.env.SEARCH_BENCHMARK_REVIEW_CSV;
const baseUrl = (
  process.env.SEARCH_BENCHMARK_BASE_URL ?? "http://127.0.0.1:5000/api"
).replace(/\/$/, "");
const token = process.env.SEARCH_BENCHMARK_TOKEN;
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const defaultOutputRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results/search",
);
const outputDir = path.resolve(
  process.env.SEARCH_BENCHMARK_OUTPUT_DIR ?? path.join(defaultOutputRoot, runId),
);

if (validateOnly) {
  console.log(
    `PASS: ${SEARCH_BENCHMARK_CASES.length} search benchmark cases are configured.`,
  );
  console.log(`Corpus version: ${SEARCH_BENCHMARK_VERSION}.`);
  console.log(
    `Gates: ${SEARCH_BENCHMARK_THRESHOLDS.resultCount} results, ${Math.round(SEARCH_BENCHMARK_THRESHOLDS.meaningfulPreviewCoverage * 100)}% meaningful previews, ${Math.round(SEARCH_BENCHMARK_THRESHOLDS.usefulPrecisionAt5 * 100)}% human Precision@5.`,
  );
  console.log(`Target would be ${baseUrl}. No network request was made.`);
  process.exit(0);
}

if (reviewFlagIndex !== -1 || process.env.SEARCH_BENCHMARK_REVIEW_CSV) {
  if (!reviewPath || reviewPath.startsWith("--")) {
    console.error(
      "Provide --review=path/to/search-human-review.csv or SEARCH_BENCHMARK_REVIEW_CSV.",
    );
    process.exit(2);
  }
  try {
    const absoluteReviewPath = path.resolve(reviewPath);
    const review = evaluateHumanReview(
      parseCsv(fs.readFileSync(absoluteReviewPath, "utf8")),
    );
    const outputPath =
      process.env.SEARCH_BENCHMARK_REVIEW_OUTPUT ??
      absoluteReviewPath.replace(/\.csv$/i, "") + "-evaluation.json";
    fs.writeFileSync(outputPath, `${JSON.stringify(review, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
    console.error(`Human review evaluation: ${outputPath}`);
    if (review.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
} else {

function markdown(report) {
  const rows = report.rows
    .map((row) => {
      const failedGates = row.gates
        ? Object.entries(row.gates)
            .filter(([, passed]) => !passed)
            .map(([gate]) => gate)
            .join(", ")
        : `HTTP ${row.status ?? 0}`;
      const status = row.passed
        ? "PASS"
        : row.gates
          ? "FAIL-CONFIRMED"
          : "BLOCKED-EXTERNAL";
      return `| ${row.query.replaceAll("|", "\\|")} | ${row.inferredIntent ?? "—"} | ${row.resultCount ?? 0} | ${row.distinctProviders ?? 0} | ${Math.round((row.previewCoverage ?? 0) * 100)}% | ${status} | ${failedGates || "—"} |`;
    })
    .join("\n");
  return `# Casparel search benchmark

- Run: ${report.runId}
- Corpus: ${report.corpusVersion}
- Target: ${report.baseUrl}
- Automated status: **${report.automatedStatus}**
- Automated gates: ${report.passed}/${report.total} passed
- Human pedagogical judgment: **NOT-TESTED**

Automated gates measure intent, diversity, concentration, critical top-three results, and meaningful previews. They do not prove pedagogical usefulness. Complete \`search-human-review.csv\`, then run \`SEARCH_BENCHMARK_REVIEW_CSV=/path/to/search-human-review.csv pnpm --filter @workspace/api-server benchmark:search:review\` to validate the rubric and calculate Precision@5.

| Query | Inferred intent | Results | Providers | Preview | Status | Failed gates |
|---|---:|---:|---:|---:|---:|---|
${rows}
`;
}

const rows = [];

for (const benchmarkCase of SEARCH_BENCHMARK_CASES) {
  const { query, expectedIntent } = benchmarkCase;
  const url = new URL(`${baseUrl}/resources/discover`);
  url.searchParams.set("q", query);
  url.searchParams.set("language", "any");
  url.searchParams.set("intent", "auto");
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      rows.push({
        query,
        expectedIntent,
        status: response.status,
        error: (await response.text()).replace(/\s+/g, " ").slice(0, 300),
        passed: false,
      });
      continue;
    }

    const results = await response.json();
    const inferredIntent = response.headers.get("x-search-intent");
    const evaluation = evaluateAutomatedResult(
      results,
      benchmarkCase,
      inferredIntent,
    );
    rows.push(evaluation);
  } catch (error) {
    rows.push({
      query,
      expectedIntent,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      passed: false,
    });
  }
}

const passed = rows.filter((row) => row.passed).length;
const automatedStatus = classifyAutomatedRun(rows);
const report = {
  runId,
  corpusVersion: SEARCH_BENCHMARK_VERSION,
  baseUrl,
  passed,
  total: rows.length,
  automatedStatus,
  humanJudgmentStatus: "NOT-TESTED",
  rows,
};
report.summary = summarizeAutomatedRows(rows);
fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "search-benchmark.json");
const markdownPath = path.join(outputDir, "search-benchmark.md");
const reviewPath = path.join(outputDir, "search-human-review.csv");
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(markdownPath, markdown(report));
fs.writeFileSync(reviewPath, humanReviewCsv(rows));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
console.error(`Markdown report: ${markdownPath}`);
console.error(`Human review sheet: ${reviewPath}`);
if (automatedStatus === "FAIL-CONFIRMED") process.exitCode = 1;
if (automatedStatus === "BLOCKED-EXTERNAL") process.exitCode = 2;
}
