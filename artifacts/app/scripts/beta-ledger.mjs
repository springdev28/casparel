/**
 * @fileOverview Web support role: configures or validates the Beta Ledger part of the Vite/React application.
 * System connection: participates in browser development, build, quality checks, or deployment.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BETA_STATUSES = new Set([
  "PASS",
  "FAIL-CONFIRMED",
  "DESIGN-DEFECT",
  "NEEDS-LIVE-REPRO",
  "BLOCKED-EXTERNAL",
  "NOT-TESTED",
]);

const PRODUCTION_HOSTS = new Set(["casparel.com", "www.casparel.com"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_ARTIFACT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results/beta",
);

function enabled(value) {
  return /^(1|true|yes)$/i.test(value ?? "");
}

export function createRunId(now = new Date()) {
  return now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

/**
 * Resolve and enforce the live-suite safety boundary before a browser starts.
 * Production is always denied. A remote staging host additionally needs an
 * explicit opt-in so a copied command cannot create test accounts by accident.
 */
export function resolveBetaConfig(env = process.env) {
  if (!env.BETA_BASE_URL) {
    throw new Error(
      "BETA_BASE_URL is required. Point it at localhost or an isolated staging deployment.",
    );
  }

  let parsed;
  try {
    parsed = new URL(env.BETA_BASE_URL);
  } catch {
    throw new Error("BETA_BASE_URL must be a valid absolute URL.");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("BETA_BASE_URL must use http or https.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to run the destructive beta suite against production host ${hostname}.`,
    );
  }

  const local = LOCAL_HOSTS.has(hostname);
  if (!local && !enabled(env.BETA_ALLOW_STAGING_RUN)) {
    throw new Error(
      "Remote beta runs require BETA_ALLOW_STAGING_RUN=true after confirming the target is isolated staging.",
    );
  }

  const runId = env.BETA_RUN_ID?.trim() || createRunId();
  const baseUrl = parsed.toString().replace(/\/+$/, "");
  const artifactRoot = path.resolve(
    env.BETA_ARTIFACTS_DIR || DEFAULT_ARTIFACT_ROOT,
  );

  return {
    runId,
    baseUrl,
    environment: env.BETA_ENVIRONMENT?.trim() || (local ? "local" : "staging"),
    artifactDir: path.join(artifactRoot, runId),
    keepAccounts: enabled(env.BETA_KEEP_ACCOUNTS),
    headless: !enabled(env.BETA_HEADED),
  };
}

export function createLedger({ config, commit }) {
  return {
    runId: config.runId,
    environment: config.environment,
    baseUrl: config.baseUrl,
    commit,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    results: [],
    unexpectedConsoleErrors: [],
    unexpectedApiErrors: [],
    cleanup: [],
  };
}

export function addLedgerResult(ledger, result) {
  if (!BETA_STATUSES.has(result.status)) {
    throw new Error(`Invalid beta status: ${result.status}`);
  }
  ledger.results.push(result);
}

function tableCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

export function renderLedgerMarkdown(ledger) {
  const passed = ledger.results.filter(
    (result) => result.status === "PASS",
  ).length;
  const rows = ledger.results
    .map(
      (result) =>
        `| ${tableCell(result.id)} | ${tableCell(result.persona)} | ${result.status} | ${result.durationMs} | ${tableCell(result.detail)} |`,
    )
    .join("\n");
  const consoleErrors = ledger.unexpectedConsoleErrors.length
    ? ledger.unexpectedConsoleErrors
        .map((item) => `- ${tableCell(item)}`)
        .join("\n")
    : "- None";
  const apiErrors = ledger.unexpectedApiErrors.length
    ? ledger.unexpectedApiErrors
        .map(
          (item) =>
            `- ${item.status} ${item.method} ${item.url}${item.body ? ` — ${tableCell(item.body)}` : ""}`,
        )
        .join("\n")
    : "- None";
  const cleanup = ledger.cleanup.length
    ? ledger.cleanup
        .map(
          (item) =>
            `- ${item.persona}: ${item.status}${item.detail ? ` — ${tableCell(item.detail)}` : ""}`,
        )
        .join("\n")
    : "- Not run";

  return `# Casparel beta ledger

- Run: ${ledger.runId}
- Environment: ${ledger.environment}
- Base URL: ${ledger.baseUrl}
- Commit: ${ledger.commit}
- Result: ${passed}/${ledger.results.length} scenarios passed

| Test | Persona | Status | Duration (ms) | Detail |
|---|---|---:|---:|---|
${rows || "| — | — | NOT-TESTED | 0 | No scenarios ran |"}

## Unexpected console errors

${consoleErrors}

## Unexpected API errors

${apiErrors}

## Test-account cleanup

${cleanup}
`;
}

export function writeLedger(ledger, artifactDir) {
  fs.mkdirSync(artifactDir, { recursive: true });
  ledger.finishedAt = new Date().toISOString();
  const jsonPath = path.join(artifactDir, "beta-ledger.json");
  const markdownPath = path.join(artifactDir, "beta-ledger.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(ledger, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderLedgerMarkdown(ledger));
  return { jsonPath, markdownPath };
}
