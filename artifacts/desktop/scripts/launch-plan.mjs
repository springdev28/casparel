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
 * Rosetta 2 is the other half. An x86_64 binary spawned on an Apple Silicon Mac
 * with Rosetta installed is translated by the kernel with no help from the
 * caller -- no `arch -x86_64` wrapper, nothing. So the Intel image IS launchable
 * on the arm64 runner, and the old guard was the only thing preventing it.
 * Without Rosetta the spawn fails with "Bad CPU type in executable", which is a
 * fact about the runner rather than a defect in the build, so it is a skip.
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
 * @param {{archs: string[], hostArch: string, hasRosetta?: boolean}} input
 *   archs as `lipo -archs` reports them, hostArch as `process.arch` reports it.
 * @returns {{launch: boolean, translated?: boolean, why?: string}}
 */
export function launchPlan({ archs, hostArch, hasRosetta = false }) {
  const usable = normaliseArchs(archs);

  if (usable.length === 0) {
    return { launch: false, why: "the executable reported no architectures" };
  }
  if (usable.includes(hostArch)) {
    return { launch: true, translated: false };
  }
  // The only translation macOS offers, and only in this direction.
  if (hostArch === "arm64" && usable.includes("x64")) {
    return hasRosetta
      ? { launch: true, translated: true }
      : {
          launch: false,
          why:
            "this is the Intel build and the host is Apple Silicon without " +
            "Rosetta 2 installed, so nothing here can start it. Install " +
            "Rosetta on the runner, or run this on an Intel machine.",
        };
  }
  return {
    launch: false,
    why: `this image is for ${usable.join("/")} and the host is ${hostArch}, which cannot execute it`,
  };
}
