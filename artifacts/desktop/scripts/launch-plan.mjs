/**
 * @fileOverview Desktop support role: configures or verifies Launch Plan for the Electron distribution.
 * System connection: participates in packaging, installer metadata, or controlled-window smoke validation.
 */
/**
 * Whether the machine running the release checks can actually START the binary
 * inside a .dmg, and when it cannot, why not.
 *
 * This is a pure function for the same reason `smoke-verdict.mjs` is: the
 * decision it makes was wrong, in a way that no amount of green runs would have
 * shown. `verify-app-macos.mjs` compared `lipo -archs` output against
 * `process.arch`, and those two do not use the same vocabulary. lipo says
 * `x86_64`; Node says `x64`. So on an Intel machine the comparison was
 * `["x86_64"].includes("x64")` -- false -- and the script would have inspected
 * the Intel app and skipped launching it, on the one machine that could run it.
 * It only ever worked on Apple Silicon, where both names happen to be `arm64`.
 *
 * Rosetta is deliberately not consulted, and that is a reversal. An x86_64
 * binary does start on Apple Silicon under translation, so treating the Intel
 * image as launchable there looked like free coverage. It measured the wrong
 * thing and then failed: the 1.0.2 gate ran the Intel image under Rosetta, got
 * a process that lived its full sixty seconds and printed nothing, and blocked
 * the release on a result no one could interpret -- translation is slow enough
 * on a cold runner that "broken build" and "needed longer" produce the same
 * silence. A longer timeout only measures translation more patiently.
 *
 * What an Intel owner runs is the x64 binary on an Intel CPU, and the only
 * thing that tests it is an Intel machine. There is one in the release
 * workflow and one in desktop-verify-macos.yml. Anywhere else, a non-native
 * image is inspected and its launch is a named skip.
 */

/** What `lipo -archs` calls each architecture, in `process.arch` terms. */
const NODE_ARCH = {
  x86_64: "x64",
  arm64: "arm64",
  arm64e: "arm64",
  i386: "ia32",
};

/** lipo's names for one architecture, for reporting it back the way it came. */
export function toNodeArch(name) {
  return NODE_ARCH[name] ?? name;
}

export function normaliseArchs(archs) {
  return [...new Set((archs ?? []).map(toNodeArch))];
}

/**
 * @param {{archs: string[], hostArch: string}} input
 *   archs as `lipo -archs` reports them, hostArch as `process.arch` reports it.
 * @returns {{launch: boolean, why?: string}}
 */
export function launchPlan({ archs, hostArch }) {
  const usable = normaliseArchs(archs);

  if (usable.length === 0) {
    return { launch: false, why: "the executable reported no architectures" };
  }
  if (usable.includes(hostArch)) {
    return { launch: true };
  }
  // Natively or not at all. See the note above on why Rosetta is not a third
  // answer here.
  return {
    launch: false,
    why:
      `this image is for ${usable.join("/")} and the host is ${hostArch}, so ` +
      `nothing could be launched here. Run this leg on a machine of the ` +
      `image's own architecture.`,
  };
}
