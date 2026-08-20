/**
 * Whether an installer's signature is what this release intended it to be.
 *
 * Both platform verifiers already read the signature and print it as a note,
 * which was right while no certificate existed: failing on unsigned would have
 * made every release red for a condition nobody could fix. It stops being right
 * the moment a certificate is configured, because a note cannot fail. A signing
 * step that quietly broke -- an expired certificate, a secret renamed, a
 * password wrong -- would produce unsigned installers, print a note saying so,
 * and pass. The whole point of signing is that users can trust the artifact;
 * discovering it silently stopped happening from a user's Gatekeeper warning is
 * the worst available way to find out.
 *
 * So intent is an input. When the release was not configured to sign, the
 * signature is reported and nothing is asserted. When it WAS, an unsigned or
 * unverifiable artifact is a failure of the release, not a footnote to it.
 *
 * "Unknown" is deliberately not treated as "probably fine". A probe that cannot
 * read a signature has not established there is one, and the Windows verifier
 * already learned this the hard way: its first version reported "unknown"
 * permanently because a PowerShell module would not auto-load, which would have
 * gone on reassuring people long after signing broke.
 */

/** What a platform's signature probe found, normalised across the two. */
export const SIGNED = "signed";
export const UNSIGNED = "unsigned";
export const UNKNOWN = "unknown";

/**
 * @param {{state: string, detail?: string, expected: boolean}} input
 *   state    one of SIGNED / UNSIGNED / UNKNOWN
 *   detail   what the platform tool actually said, for the report
 *   expected whether this release was configured with a signing certificate
 * @returns {{kind: "pass"|"fail"|"note", detail: string, reason?: string}}
 */
export function classifySigning({ state, detail = "", expected }) {
  if (!expected) {
    // No certificate configured. Say what was found and assert nothing: this is
    // the deliberate state for a project that has not obtained one yet.
    return { kind: "note", detail: detail || state };
  }
  if (state === SIGNED) {
    return { kind: "pass", detail: detail || state };
  }
  return {
    kind: "fail",
    detail: detail || state,
    reason:
      state === UNSIGNED
        ? `a signing certificate is configured for this release, but the artifact came out unsigned. ` +
          `The build did not fail, so the certificate was accepted and then not used -- check that the ` +
          `secret holds the certificate rather than a path to one, and that its password is right.`
        : `a signing certificate is configured for this release, but the signature could not be read, ` +
          `so nothing about it has been established. An unreadable signature is not a signature.`,
  };
}

/**
 * macOS: `codesign -dv` names the signing authority only for a real identity.
 * An ad-hoc signature has none, and Apple Silicon requires ad-hoc at minimum,
 * so "has a signature" and "has an identity" are different questions and only
 * the second one means anything to a user.
 */
export function macSigningState(codesignOutput) {
  if (!codesignOutput) return UNKNOWN;
  if (/^Authority=/m.test(codesignOutput)) return SIGNED;
  if (/code object is not signed at all/i.test(codesignOutput)) return UNSIGNED;
  // Signed, but with nothing that identifies a developer.
  if (/Signature=adhoc/i.test(codesignOutput)) return UNSIGNED;
  return UNKNOWN;
}

/** Windows: Get-AuthenticodeSignature's Status, or null if no probe answered. */
export function windowsSigningState(status) {
  if (!status) return UNKNOWN;
  const value = status.trim();
  if (value === "Valid") return SIGNED;
  if (value === "NotSigned") return UNSIGNED;
  // HashMismatch, UnknownError, NotTrusted and friends: there is something
  // there and it did not check out. Never a pass.
  return UNKNOWN;
}
