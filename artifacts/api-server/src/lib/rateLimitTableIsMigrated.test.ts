/**
 * @fileOverview Verification role: keeps the shared rate-limit table in the
 * Drizzle schema and migration history.
 * System connection: usage reporting and every persistent limiter query this
 * table; a boot-only CREATE left production returning 500 when the initializer
 * did not run.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../../../lib/db");
const schema = readFileSync(
  resolve(dbRoot, "src/schema/rateLimitHits.ts"),
  "utf8",
);
const schemaIndex = readFileSync(resolve(dbRoot, "src/schema/index.ts"), "utf8");
const migrations = readdirSync(resolve(dbRoot, "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(resolve(dbRoot, "migrations", name), "utf8"))
  .join("\n");

describe("persistent rate-limit storage", () => {
  it("is part of the exported Drizzle schema", () => {
    expect(schema).toContain('pgTable(\n  "rate_limit_hits"');
    expect(schemaIndex).toContain('export * from "./rateLimitHits"');
  });

  it("is created by a migration and protected from the Data API", () => {
    expect(migrations).toMatch(/CREATE TABLE IF NOT EXISTS "rate_limit_hits"/);
    expect(migrations).toMatch(
      /ALTER TABLE "rate_limit_hits" ENABLE ROW LEVEL SECURITY/,
    );
  });
});
