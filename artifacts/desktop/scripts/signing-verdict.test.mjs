#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Signing Verdict.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The cases that decide whether an unsigned installer is a fact or a failure.
 *
 * The pairing that matters is the first two: the SAME unsigned artifact has to
 * be a note today and a failure once a certificate exists. Get that wrong in
 * one direction and every release is red for a condition nobody can fix; get it
 * wrong in the other and signing can break without anything noticing, which is
 * the failure this check exists to prevent.
 */
import {
  SIGNED,
  UNKNOWN,
  UNSIGNED,
  classifySigning,
  macSigningState,
  windowsSigningState,
} from "./signing-verdict.mjs";

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

// Today: no certificate, so an unsigned build is the expected state.
is(
  "unsigned is only a note when nothing was configured",
  classifySigning({ state: UNSIGNED, expected: false }).kind,
  "note",
);

// The same artifact, once a certificate exists. This is the whole point.
is(
  "unsigned is a failure when a certificate was configured",
  classifySigning({ state: UNSIGNED, expected: true }).kind,
  "fail",
);

is(
  "signed passes when a certificate was configured",
  classifySigning({ state: SIGNED, expected: true }).kind,
  "pass",
);

// A probe that could not read the signature has established nothing. The
// Windows verifier spent a version reporting "unknown" permanently because a
// PowerShell module would not load; that must never read as success.
is(
  "unknown is a failure when a certificate was configured",
  classifySigning({ state: UNKNOWN, expected: true }).kind,
  "fail",
);

// Every failure has to say what to check, or it is just a red light.
for (const state of [UNSIGNED, UNKNOWN]) {
  is(
    `the ${state} failure explains itself`,
    Boolean(classifySigning({ state, expected: true }).reason),
    true,
  );
}

// --- reading what the platforms actually say -------------------------------

// A real identity. Only this means anything to somebody downloading the app.
is(
  "an Authority line is a real signature",
  macSigningState(
    "Executable=/Applications/Casparel.app\nAuthority=Developer ID Application: Casparel (ABCDE12345)\nTeamIdentifier=ABCDE12345",
  ),
  SIGNED,
);

// Apple Silicon requires an ad-hoc signature at minimum, so "signed" and
// "identifies a developer" are different questions. Ad-hoc answers neither.
is(
  "an ad-hoc signature is not a signature for our purposes",
  macSigningState("Executable=/Applications/Casparel.app\nSignature=adhoc"),
  UNSIGNED,
);

is(
  "an unsigned bundle reads as unsigned",
  macSigningState("code object is not signed at all"),
  UNSIGNED,
);

is("no codesign output reads as unknown", macSigningState(""), UNKNOWN);

is("Valid is a Windows signature", windowsSigningState("Valid"), SIGNED);
is("NotSigned is unsigned", windowsSigningState("NotSigned"), UNSIGNED);

// Something is there and it did not check out. Never a pass.
is("HashMismatch is not a pass", windowsSigningState("HashMismatch"), UNKNOWN);
is("NotTrusted is not a pass", windowsSigningState("NotTrusted"), UNKNOWN);
is("no probe answered reads as unknown", windowsSigningState(null), UNKNOWN);

console.log(
  failures === 0
    ? "\nSigning verdicts are read correctly."
    : `\n${failures} case(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
