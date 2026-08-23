/**
 * @fileOverview Verification role: exercises Activity Types Are In The Contract.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every activity type the server writes is one the contract can return.
 *
 * `GET /activity/recent` reads rows back and hands them to
 * `GetRecentActivityResponse.parse`. The column is free text; the schema is an
 * enum. So writing a row with a type the enum does not list does not fail
 * where it is written -- it fails later, on read, as a 500 for the person it
 * happened to, every time they open their dashboard, until somebody deletes
 * the row. The feature that wrote it looks fine; a different page breaks.
 *
 * Nothing else could see it. The insert satisfies the database, the handler
 * satisfies its own tests, and the two only meet in a row that has to exist
 * first. Holding the writes against the enum is the whole check.
 *
 * The enum currently lists one type nothing writes -- `list`. That is fine and
 * is not asserted the other way round: a contract may allow more than the code
 * uses today, and narrowing it would be a breaking change for any client
 * already handling it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverSrc = resolve(here, "..");

/**
 * The enum, read from the spec rather than from the generated client.
 *
 * openapi.yaml is where the contract is decided; the generated packages are
 * copies of it, and api-server does not depend on them. Reading the source of
 * truth also means a spec edit that has not been regenerated yet is still
 * checked.
 */
const spec = readFileSync(resolve(here, "../../../../lib/api-spec/openapi.yaml"), "utf8");
const activityItem = spec.slice(spec.indexOf("\n    ActivityItem:"));
const enumLine = /type:\s*\{\s*type:\s*string,\s*enum:\s*\[([^\]]+)\]/.exec(activityItem);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Every `type:` written near an insert into the activity log.
 *
 * A window rather than a parse: these inserts are object literals a few lines
 * long, and the alternative is a TypeScript AST for a question that is really
 * "what string literals sit next to this call".
 */
const written = new Map<string, string>(); // type -> where
for (const file of sources(serverSrc)) {
  const text = readFileSync(file, "utf8");
  const where = relative(serverSrc, file);
  for (const insert of [...text.matchAll(/insert\(activityLogTable\)/g)]) {
    const window = text.slice(insert.index, insert.index + 600);
    for (const match of window.matchAll(/\btype:\s*"([a-z_-]+)"/g)) {
      written.set(match[1], `${where} (${match[1]})`);
    }
  }
}

const allowed = new Set<string>(
  (enumLine?.[1] ?? "").split(",").map((value) => value.trim()).filter(Boolean),
);

describe("the activity log", () => {
  it("found the contract's enum", () => {
    // Without this, a moved or reshaped schema makes `allowed` empty, and an
    // empty allowed set fails everything -- or, worse in another arrangement,
    // nothing. Say plainly that the spec was read.
    expect([...allowed].sort(), `no ActivityItem enum found in openapi.yaml`).toContain(
      "class",
    );
  });

  it("has writes this test can actually find", () => {
    // If the insert were renamed or wrapped in a helper, this file would pass
    // by comparing an empty set against the enum, which is no check at all.
    expect(
      [...written.keys()],
      "no activity-log writes found; has the insert moved behind a helper?",
    ).not.toEqual([]);
  });

  it("writes only types the response schema will accept", () => {
    const unknown = [...written].filter(([type]) => !allowed.has(type));
    expect(
      unknown.map(([, where]) => where),
      `these write an activity type the contract does not list, so ` +
        `GET /activity/recent will reject the row on read and 500 the ` +
        `dashboard for whoever triggered it; add the type to ` +
        `lib/api-spec/openapi.yaml and regenerate`,
    ).toEqual([]);
  });
});
