/**
 * @fileOverview Verification role: exercises Api Contract Coverage.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROUTE_PATTERN =
  /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gs;
const METHOD_PATTERN = /^    (get|post|put|patch|delete):\s*$/;
const PATH_PATTERN = /^  (\/[^:]+):\s*$/;

// Existing manual-contract debt is explicit and can only shrink. When a
// domain moves into OpenAPI, remove its operations from this list in the same
// change. A newly added Express operation fails this test until it is either
// specified or deliberately recorded here for a bounded follow-up.
const ALLOWED_UNDOCUMENTED_OPERATIONS = [
  "DELETE /admin/users/{param}/work/{param}/{param}",
  "GET /admin/users/{param}/details",
  "GET /auth/google/callback",
  "GET /classes/{param}/shared-lists",
  "GET /learning-goal-templates",
  "GET /resources/oembed",
  "GET /users/me/access",
  "PATCH /admin/users/{param}/classes/{param}",
  "PATCH /admin/users/{param}/classes/{param}/membership",
  "PATCH /admin/users/{param}/work/{param}/{param}",
  "POST /learning-goal-templates",
  "POST /learning-goal-templates/{param}/clone",
  "POST /resources/{param}/recommend",
  "POST /webhooks/revenuecat",
] as const;

function normalizePath(path: string) {
  return path
    .replace(/:([A-Za-z0-9_]+)/g, "{param}")
    .replace(/\{[^}]+\}/g, "{param}");
}

function expressOperations(routesDirectory: string) {
  const operations: string[] = [];
  const files = readdirSync(routesDirectory).filter(
    (file) =>
      file.endsWith(".ts") &&
      !file.endsWith(".test.ts") &&
      file !== "loginCompat.ts",
  );
  for (const file of files) {
    const source = readFileSync(resolve(routesDirectory, file), "utf8");
    for (const match of source.matchAll(ROUTE_PATTERN)) {
      operations.push(`${match[1].toUpperCase()} ${normalizePath(match[2])}`);
    }
  }
  return [...new Set(operations)].sort();
}

function openApiOperations(specPath: string) {
  const operations = new Set<string>();
  let currentPath = "";
  for (const line of readFileSync(specPath, "utf8").split(/\r?\n/)) {
    const pathMatch = PATH_PATTERN.exec(line);
    if (pathMatch) {
      currentPath = normalizePath(pathMatch[1]);
      continue;
    }
    const methodMatch = METHOD_PATTERN.exec(line);
    if (currentPath && methodMatch) {
      operations.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }
  return operations;
}

describe("OpenAPI route coverage", () => {
  it("does not add or lose undocumented Express operations silently", () => {
    const routesDirectory = dirname(fileURLToPath(import.meta.url));
    const repositoryRoot = resolve(routesDirectory, "../../../..");
    const express = expressOperations(routesDirectory);
    const documented = openApiOperations(
      resolve(repositoryRoot, "lib/api-spec/openapi.yaml"),
    );
    const undocumented = express.filter((operation) => !documented.has(operation));
    const covered = express.length - undocumented.length;

    expect(undocumented).toEqual([...ALLOWED_UNDOCUMENTED_OPERATIONS]);
    expect(covered / express.length).toBeGreaterThanOrEqual(0.61);
  });
});
