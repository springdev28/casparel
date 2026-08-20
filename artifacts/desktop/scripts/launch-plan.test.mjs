#!/usr/bin/env node
/**
 * The cases that decide whether a release check launches the app or only looks
 * at it.
 *
 * The one that shipped a bug is the first: `lipo -archs` and `process.arch`
 * disagree about the name of Intel, so the old comparison could never be true
 * on an Intel Mac. That is the machine the Intel build exists for, so the check
 * would have inspected it and gone home on the only host able to start it --
 * and reported a clean run either way.
 *
 * The opposite mistake would be worse: claiming a launch on a host that cannot
 * execute the binary turns a failed spawn into a red build with no defect
 * behind it, so a genuinely unrunnable pairing must stay a non-launch.
 */
import { launchPlan, normaliseArchs, toNodeArch } from "./launch-plan.mjs";

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

// The bug. lipo says x86_64, Node says x64, and they mean the same machine.
is("x86_64 is what Node calls x64", toNodeArch("x86_64"), "x64");
is(
  "the Intel build launches on an Intel host",
  launchPlan({ archs: ["x86_64"], hostArch: "x64" }),
  { launch: true, translated: false },
);

// The pairing that already worked, which is why the bug stayed hidden.
is(
  "the arm64 build launches on an arm64 host",
  launchPlan({ archs: ["arm64"], hostArch: "arm64" }),
  { launch: true, translated: false },
);

// Rosetta 2 translates on spawn, so the Intel image IS runnable here.
is(
  "the Intel build launches on Apple Silicon with Rosetta",
  launchPlan({ archs: ["x86_64"], hostArch: "arm64", hasRosetta: true }),
  { launch: true, translated: true },
);

// Without it the spawn dies on "Bad CPU type", which is the runner's shape and
// not a defect in the build, so it must not become a launch attempt.
is(
  "the Intel build does not launch on Apple Silicon without Rosetta",
  launchPlan({ archs: ["x86_64"], hostArch: "arm64" }).launch,
  false,
);

// Translation runs one way only. There is no arm64-on-Intel.
is(
  "the arm64 build never launches on Intel",
  launchPlan({ archs: ["arm64"], hostArch: "x64", hasRosetta: true }).launch,
  false,
);

// A universal binary satisfies either host directly.
is(
  "a universal binary launches natively on both",
  [
    launchPlan({ archs: ["x86_64", "arm64"], hostArch: "x64" }),
    launchPlan({ archs: ["x86_64", "arm64"], hostArch: "arm64" }),
  ],
  [
    { launch: true, translated: false },
    { launch: true, translated: false },
  ],
);

// lipo failing leaves nothing to reason about; do not guess.
is(
  "no architectures means no launch",
  launchPlan({ archs: [], hostArch: "arm64", hasRosetta: true }).launch,
  false,
);

is("names are deduplicated", normaliseArchs(["arm64", "arm64e"]), ["arm64"]);

// Every non-launch has to say why, or the run reports a silent hole.
for (const plan of [
  launchPlan({ archs: [], hostArch: "arm64" }),
  launchPlan({ archs: ["x86_64"], hostArch: "arm64" }),
  launchPlan({ archs: ["arm64"], hostArch: "x64" }),
]) {
  is(`a non-launch carries a reason`, Boolean(plan.why), true);
}

console.log(
  failures === 0
    ? "\nLaunch decisions are made correctly."
    : `\n${failures} case(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
