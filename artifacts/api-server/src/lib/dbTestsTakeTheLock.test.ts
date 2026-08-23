/**
 * @fileOverview Verification role: exercises Db Tests Take The Lock.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every database test file has to take the lock.
 *
 * The lock in dbTestLock.ts is opt-in: a file that does not call
 * useExclusiveDatabase() runs concurrently with the ones that do, and since
 * each empties the tables it seeds, the result is the failure the lock exists
 * to prevent -- a duplicate key inside a fixture, or worse, a suite asserting
 * against another file's rows and passing for the wrong reason.
 *
 * Opt-in is the right shape (a file with no fixtures to protect should not pay
 * for a lock), but it means the protection is only as good as the next
 * person's memory. This checks instead of remembering. A new *.db.test.ts
 * without the call fails here, naming the file, rather than by intermittently
 * corrupting somebody else's run months later.
 *
 * It is deliberately a directory listing rather than a fixed list: a fixed
 * list would need the same remembering.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const databaseTests = readdirSync(srcDir)
  .filter((name) => name.endsWith(".db.test.ts"))
  .map((name) => ({
    name,
    text: readFileSync(resolve(srcDir, name), "utf8"),
  }));

describe("database tests do not run over each other", () => {
  it("finds the files to check", () => {
    // A rename of the .db.test.ts convention would make this vacuous, which is
    // the failure this file exists to catch.
    expect(databaseTests.length).toBeGreaterThanOrEqual(2);
  });

  it.each(databaseTests.map((f) => [f.name, f.text]))(
    "%s takes the lock",
    (_name, text) => {
      expect(
        text.includes("useExclusiveDatabase()"),
        "this file empties tables other database tests also seed, so without " +
          "useExclusiveDatabase() from ./dbTestLock it will race them",
      ).toBe(true);
    },
  );
});
