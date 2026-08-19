/**
 * What a packaged app's SMOKE line means.
 *
 * Separated from verify-app-macos.mjs so it can be tested on any machine. That
 * script exits early unless it is running on macOS -- correctly, since it
 * mounts a disk image -- which would otherwise make the one piece of real
 * decision-making in it the one piece that never gets tested.
 *
 * The distinction that matters is between a probe that FAILED and a probe the
 * build does not UNDERSTAND. The shell's smoke hook answers an unrecognised
 * mode by falling through to its embed branch, which reports "app-intact" when
 * the window is healthy. desktop-v1.0.0 was built before the hardening probe
 * existed, so it answers exactly that -- and reading it as a failed hardening
 * check reported a security defect in an app with nothing wrong with it.
 *
 * A release check that cries wolf on the older releases it exists to check is
 * worse than no check, so "unsupported" is its own outcome: never a pass,
 * never a failure.
 */

/** The healthy result of the fall-through branch: window still on the app. */
const FELL_THROUGH = "app-intact";

/**
 * @param {string | null} verdict the text after "SMOKE:", or null if absent
 * @returns {{kind: "hardened" | "unsupported" | "bad", reason?: string}}
 */
export function classifySmokeVerdict(verdict) {
  if (verdict === "hardened") return { kind: "hardened" };
  if (verdict === FELL_THROUGH) return { kind: "unsupported" };
  if (verdict === null || verdict === "") {
    return { kind: "bad", reason: "the app printed no SMOKE line at all" };
  }
  // "node reachable from the page: ..." is the finding the probe exists for,
  // and "window-lost" means the app showed the offline page instead of the
  // page it was given. Anything unrecognised is also a failure rather than a
  // shrug: a verdict nobody predicted is not evidence of health.
  return { kind: "bad", reason: `the app reported "${verdict}"` };
}

/** Pulls the verdict out of a packaged app's stdout. */
export function smokeVerdict(output) {
  const line = (output ?? "")
    .split("\n")
    .find((entry) => entry.startsWith("SMOKE:"));
  return line ? line.slice("SMOKE:".length).trim() : null;
}
