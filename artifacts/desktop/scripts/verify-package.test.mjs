#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Verify Package.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The difference between "the installers are broken" and "nobody built them".
 *
 * With no release directory, verify-package.mjs used to print "2 problem(s)
 * with the Linux packages" and exit 1. That is the verdict for a build that
 * produced something wrong, and it was being given to a checkout where no
 * build had run -- which in CI reads as a broken release and sends somebody
 * looking for a fault that is not there. Every other check in this repository
 * uses 75 for a run that could not look: the smoke check, the four end-to-end
 * scripts, every audit.
 *
 * The distinction has to hold in both directions, which is what this pins. A
 * build that produced one of the two artefacts and not the other is a real
 * failure and must stay exit 1; only "neither exists" is inconclusive.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "verify-package.mjs");

let failures = 0;

function is(label, actual, expected) {
  if (actual === expected) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}\n     expected exit ${expected}, got ${actual}`);
}

function exitFor(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-package-"));
  for (const name of files) fs.writeFileSync(path.join(dir, name), "");
  const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return run.status;
}

console.log("\nWhat verify-package.mjs says about a directory.\n");

is("an empty release directory is inconclusive, not a failure", exitFor([]), 75);
is(
  "a directory that does not exist is inconclusive too",
  spawnSync(process.execPath, [SCRIPT, path.join(os.tmpdir(), "no-such-release-dir")], {
    encoding: "utf8",
  }).status,
  75,
);
is(
  "an .AppImage with no .deb is a failure",
  exitFor(["Casparel-1.0.0.AppImage"]),
  1,
);

console.log(
  failures === 0
    ? "\nA missing build and a broken one are told apart.\n"
    : `\n${failures} case(s) wrong.\n`,
);
process.exit(failures === 0 ? 0 : 1);
