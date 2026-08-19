#!/usr/bin/env node
/**
 * The cases that matter for reading a packaged app's smoke result.
 *
 * The one that caused a false alarm is "app-intact": desktop-v1.0.0 was built
 * before the hardening probe existed, so it answers the fall-through branch's
 * healthy result, and the first version of this check called that a security
 * failure.
 *
 * The opposite mistake would be worse. Accepting anything that is not
 * "hardened" as "probably an old build" would turn the security check into
 * decoration, so "node reachable from the page" has to stay a failure.
 */
import { classifySmokeVerdict, smokeVerdict } from "./smoke-verdict.mjs";

let failures = 0;

function is(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.log(
      `FAIL ${label}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`,
    );
  } else {
    console.log(`ok   ${label}`);
  }
}

// A build that understands the probe and passes it.
is(
  "hardened is a pass",
  classifySmokeVerdict("hardened").kind,
  "hardened",
);

// A build that predates the probe. Not a pass, not a failure.
is(
  "app-intact is unsupported, not failure",
  classifySmokeVerdict("app-intact").kind,
  "unsupported",
);

// The finding the probe exists for. Must survive the leniency above.
is(
  "a reachable Node is a failure",
  classifySmokeVerdict("node reachable from the page: require").kind,
  "bad",
);

// The app fell back to the offline page rather than loading what it was given.
is("window-lost is a failure", classifySmokeVerdict("window-lost").kind, "bad");

// A verdict nobody predicted is not evidence of health.
is("an unknown verdict is a failure", classifySmokeVerdict("banana").kind, "bad");

// No SMOKE line at all: the app never reported anything.
is("a missing verdict is a failure", classifySmokeVerdict(null).kind, "bad");
is("an empty verdict is a failure", classifySmokeVerdict("").kind, "bad");

// Parsing, including the case where the app writes other things first.
is(
  "the verdict is read off the SMOKE line",
  smokeVerdict("some noise\nSMOKE: hardened\ntrailing"),
  "hardened",
);
is("no SMOKE line reads as null", smokeVerdict("nothing here"), null);
is("empty output reads as null", smokeVerdict(""), null);

console.log(
  failures === 0
    ? "\nSmoke verdicts are read correctly."
    : `\n${failures} case(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
