/**
 * @fileOverview Verification role: exercises Timestamp Names Reach The Boundary.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every timestamp column is named so the response boundary can find it.
 *
 * Rows arrive from Drizzle as the text Postgres wrote -- "2026-08-28
 * 15:46:13.702493+00" -- because drizzle-orm's node-postgres session replaces
 * the driver's TIMESTAMP and TIMESTAMPTZ parsers with the identity function so
 * that `mode: "string"` columns keep their string. Hermes, the engine the Expo
 * app runs on, reads that text as Invalid Date. Every such value the server
 * sends is a date the phone cannot draw.
 *
 * app.ts repairs them on the way out (see lib/contractDates.ts), and it
 * recognises them by two things: the value is exactly a Postgres timestamp,
 * and the key names a moment. The second half is a convention, and a
 * convention nothing checks is a convention that will be broken by the next
 * column somebody adds -- silently, because the web app parses the broken
 * shape happily and only the phone goes wrong.
 *
 * So the convention is checked here, where it is cheap, rather than being
 * found on a phone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const schemaDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/src/schema",
);

/**
 * Columns that never leave the server, and so need no name the boundary can
 * read. Each one is here because it was checked, not because it was awkward.
 */
const NEVER_SERIALISED = new Map([
  [
    "googleTokenExpiry",
    "calendar OAuth state: read by routes/calendar.ts to decide whether to " +
      "refresh, and never part of any response",
  ],
]);

/** How lib/contractDates.ts decides a key names a moment. */
const MOMENT_KEY = /(At|Time)$/;

function timestampColumns(): Array<{ file: string; field: string }> {
  return readdirSync(schemaDir)
    .filter((name) => name.endsWith(".ts"))
    .flatMap((name) => {
      const source = readFileSync(join(schemaDir, name), "utf8");
      return [...source.matchAll(/^\s+([A-Za-z0-9_]+):\s*timestamp\(/gm)].map(
        (match) => ({ file: name, field: match[1] }),
      );
    });
}

describe("timestamp columns", () => {
  it("are named so the response boundary rewrites them", () => {
    const unreachable = timestampColumns()
      .filter(
        ({ field }) => !MOMENT_KEY.test(field) && !NEVER_SERIALISED.has(field),
      )
      .map(({ file, field }) => `${file}: ${field}`);

    expect(
      unreachable,
      "these timestamp columns are named so that app.ts's json replacer will " +
        "not recognise them, so they would go out as the text Postgres wrote " +
        "and read as Invalid Date on every phone. Rename to end in At (or " +
        "Time), or add it to NEVER_SERIALISED with the reason it never " +
        "leaves the server",
    ).toEqual([]);
  });

  it("finds the columns at all, so an empty pass is not a pass", () => {
    const columns = timestampColumns();
    expect(columns.length).toBeGreaterThan(15);
    expect(columns.map(({ field }) => field)).toContain("createdAt");
  });

  it("does not exempt a column that has since been renamed away", () => {
    const fields = new Set(timestampColumns().map(({ field }) => field));
    const stale = [...NEVER_SERIALISED.keys()].filter(
      (field) => !fields.has(field),
    );
    expect(
      stale,
      "an exemption above names a column that no longer exists; drop it so " +
        "the list stays a statement about this schema",
    ).toEqual([]);
  });
});
