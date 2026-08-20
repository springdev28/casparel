/**
 * openapi.yaml parses, and says what its author meant.
 *
 * Codegen validates the spec, but it is the slow way to find out: a round trip
 * through orval, twice, and a complaint that names neither the line nor the
 * character. This is the same news in a fifth of a second, with the fix in the
 * message.
 *
 * The comma is not a hypothetical. A comma inside a flow mapping starts
 * another key, so
 *
 *   "404": { description: No such goal, or it is not yours }
 *
 * parses as `description: No such goal` plus a second key called
 * `or it is not yours`, and what orval says about it is "Property or it is not
 * yours is not expected to be here". That cost four round trips in one
 * afternoon -- including one immediately after a warning about it was added to
 * the top of the file, which is how this test came to exist instead.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const specPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/api-spec/openapi.yaml",
);

const lines = () => readFileSync(specPath, "utf8").split("\n");

describe("openapi.yaml", () => {
  it("has no unquoted comma inside an inline mapping", () => {
    const offenders: string[] = [];
    lines().forEach((line, index) => {
      // Comments are prose, and one of them explains this very rule.
      if (line.trimStart().startsWith("#")) return;
      // `{ key: value, ... }` where a value is unquoted and contains a comma.
      for (const inline of line.matchAll(/\{([^{}]*)\}/g)) {
        for (const pair of inline[1].split(/,(?=\s*[A-Za-z_$-]+\s*:)/)) {
          const value = pair.match(/^\s*[A-Za-z_$-]+\s*:\s*(.*)$/)?.[1]?.trim();
          if (!value || value.startsWith('"') || value.startsWith("'")) continue;
          // A flow sequence is allowed to hold commas -- `enum: [a, b, c]`,
          // `type: ["string", "null"]` -- and is the common case in this file.
          // Only an unquoted scalar with a comma in it is the mistake.
          if (value.startsWith("[") || value.startsWith("{")) continue;
          if (value.includes(",")) {
            offenders.push(`${index + 1}: ${line.trim().slice(0, 100)}`);
          }
        }
      }
    });
    expect(
      offenders,
      "A comma inside a flow mapping starts another key, so this parses as " +
        "two and codegen rejects the spec with a message that names neither " +
        "the comma nor the line. Quote the value.",
    ).toEqual([]);
  });

  it("still has the two sections everything else parses out of it", () => {
    // contractDescribesEveryRoute reads `paths:` and the schema tests read
    // `components:`, both by regex. If either heading moves or is renamed,
    // those tests quietly match nothing and pass, so their premise is checked
    // here rather than assumed there.
    const text = readFileSync(specPath, "utf8");
    expect(text).toContain("\npaths:\n");
    expect(text).toContain("\ncomponents:\n");
  });
});
