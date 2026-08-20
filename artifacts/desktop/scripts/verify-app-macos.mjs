#!/usr/bin/env node
/**
 * Opens a built .dmg the way a person would, and checks the application
 * inside it actually starts.
 *
 * `verify-package.mjs` does this for the Linux .deb and found three real
 * defects in packages that had built cleanly. The macOS half had nothing
 * equivalent, and the existing smoke test does not fill the gap: it launches
 * `node_modules/electron`, which is the development runtime, not the
 * application that gets shipped. Nothing had ever opened the .dmg.
 *
 * What that leaves undetected is a whole class of packaging failure that a
 * green build says nothing about: a bundle whose Info.plist identity is wrong,
 * an executable built for an architecture the machine cannot run, a missing
 * framework, an app that dies the moment it is launched from outside the build
 * tree.
 *
 * So this mounts the image, reads the bundle, and then runs it -- pointed at a
 * local stand-in for casparel.com, using the CASPAREL_SMOKE hook the shell
 * already has, so "it started" means a window that reached a page rather than
 * a process that had not exited yet.
 *
 *   node scripts/verify-app-macos.mjs [path/to/Casparel.dmg]
 *
 * With no argument it takes the .dmg from release/ that matches this machine's
 * architecture. The release workflow names one explicitly and runs this once
 * per image, because "the one matching this machine" is one image and the
 * release ships two: 1.0.1's Intel .dmg went out having never been opened by
 * anything. Exit 0 all good, 1 a real defect, 75 the check could not be
 * performed (not macOS, no image to test).
 *
 * A check can also be skipped, which is neither of those. This runs against a
 * *published* release, so the script is always newer than the app it opens and
 * can ask questions that app has no code to answer. Reporting those as defects
 * is a lie about the shipped build and produces a red run nobody can act on —
 * the only fix being to cut a release. Skips are named with their reason and do
 * not affect the exit code; a real defect still fails.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchPlan } from "./launch-plan.mjs";
import { classifySmokeVerdict, smokeVerdict } from "./smoke-verdict.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXIT_INCONCLUSIVE = 75;
const PORT = 4461;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let failures = 0;
let checks = 0;
let skipped = 0;

function check(label, ok, detail = "") {
  checks += 1;
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}${detail ? `\n     ${detail}` : ""}`);
  }
}

/**
 * A check this build cannot answer, which is not the same as failing it.
 *
 * This runs against a *published* release, so the script is always newer than
 * the application it opens. When it asks an older app a question that app has
 * no code for, the honest report is that nothing was measured. Calling that a
 * defect says the shipped app is unsafe when the truth is that its safety went
 * untested, and a red build nobody can act on is one people learn to ignore.
 */
function skip(label, why) {
  checks += 1;
  skipped += 1;
  console.log(`skip ${label}\n     ${why}`);
}

function inconclusive(why) {
  console.log(`\nCannot verify: ${why}`);
  process.exit(EXIT_INCONCLUSIVE);
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...options });
}

if (process.platform !== "darwin") {
  inconclusive(
    `a .dmg can only be mounted and run on macOS; this is ${process.platform}.`,
  );
}

// ---------------------------------------------------------------- the image

const hostArch = process.arch === "arm64" ? "arm64" : "x64";

function findImage() {
  const explicit = process.argv[2];
  if (explicit) return path.resolve(explicit);
  const releaseDir = path.join(ROOT, "release");
  if (!fs.existsSync(releaseDir)) return null;
  const images = fs
    .readdirSync(releaseDir)
    .filter((name) => name.endsWith(".dmg"));
  // The one this machine can actually execute. Verifying the structure of the
  // other architecture is worth doing but cannot include launching it.
  return (
    [
      images.find((name) => name.includes(hostArch)),
      images[0],
    ]
      .filter(Boolean)
      .map((name) => path.join(releaseDir, name))[0] ?? null
  );
}

const image = findImage();
if (!image || !fs.existsSync(image)) {
  inconclusive("no .dmg was given and none was found in release/.");
}
console.log(`Image: ${image}`);
console.log(`Host:  macOS ${os.release()} ${hostArch}\n`);

const expectedVersion = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
).version;

// --------------------------------------------------------------- mount it

const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), "casparel-dmg-"));
let mounted = false;
const staged = fs.mkdtempSync(path.join(os.tmpdir(), "casparel-app-"));

function cleanUp() {
  if (mounted) {
    try {
      run("hdiutil", ["detach", mountPoint, "-quiet"]);
    } catch {
      try {
        run("hdiutil", ["detach", mountPoint, "-force", "-quiet"]);
      } catch {
        /* the runner is disposable; a stuck mount is not a product defect */
      }
    }
    mounted = false;
  }
  fs.rmSync(staged, { recursive: true, force: true });
  fs.rmSync(mountPoint, { recursive: true, force: true });
}
process.on("exit", cleanUp);

try {
  run("hdiutil", [
    "attach",
    image,
    "-nobrowse",
    "-readonly",
    "-mountpoint",
    mountPoint,
    "-quiet",
  ]);
  mounted = true;
} catch (error) {
  check("the disk image mounts", false, String(error.message).trim());
  console.log(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
check("the disk image mounts", true);

// A person opening this window should see the app and somewhere to drag it.
const entries = fs.readdirSync(mountPoint);
const appName = entries.find((name) => name.endsWith(".app"));
check(
  "it contains an application bundle",
  Boolean(appName),
  `saw: ${entries.join(", ") || "(empty)"}`,
);
if (!appName) {
  console.log(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
check(
  "it offers a drag target to /Applications",
  entries.includes("Applications"),
  "the window has no Applications symlink, so there is nowhere to drag the app",
);

const appPath = path.join(mountPoint, appName);

// ------------------------------------------------------------- the bundle

const plistPath = path.join(appPath, "Contents", "Info.plist");
check("the bundle has an Info.plist", fs.existsSync(plistPath));

let plist = {};
if (fs.existsSync(plistPath)) {
  try {
    plist = JSON.parse(run("plutil", ["-convert", "json", "-o", "-", plistPath]));
  } catch (error) {
    check("the Info.plist parses", false, String(error.message).trim());
  }
}

check(
  "the bundle identifier is com.casparel.desktop",
  plist.CFBundleIdentifier === "com.casparel.desktop",
  `Info.plist says ${JSON.stringify(plist.CFBundleIdentifier)}`,
);
check(
  `the bundle version is ${expectedVersion}`,
  plist.CFBundleShortVersionString === expectedVersion,
  `Info.plist says ${JSON.stringify(plist.CFBundleShortVersionString)}, package.json says ${expectedVersion}`,
);
check(
  "the display name is Casparel",
  plist.CFBundleName === "Casparel",
  `Info.plist says ${JSON.stringify(plist.CFBundleName)}`,
);
// Without this the casparel:// links the app registers do not reach it.
const schemes = (plist.CFBundleURLTypes ?? []).flatMap(
  (type) => type.CFBundleURLSchemes ?? [],
);
check(
  "the casparel:// scheme is registered",
  schemes.includes("casparel"),
  `registered schemes: ${schemes.join(", ") || "(none)"}`,
);

const executableName = plist.CFBundleExecutable ?? "Casparel";
const executable = path.join(appPath, "Contents", "MacOS", executableName);
check(`the executable ${executableName} exists`, fs.existsSync(executable));

let archs = [];
if (fs.existsSync(executable)) {
  try {
    archs = run("lipo", ["-archs", executable]).trim().split(/\s+/);
  } catch (error) {
    check("the executable is a Mach-O binary", false, String(error.message).trim());
  }
}
check(
  "the executable carries a usable architecture",
  archs.length > 0,
  "lipo reported no architectures",
);

// Electron apps are not one file: a missing framework is a launch failure that
// nothing before this point would notice.
check(
  "the Electron framework is bundled",
  fs.existsSync(
    path.join(
      appPath,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
    ),
  ),
);

// Reported, never failed on. Today there is deliberately no certificate; the
// point is that the run says which it was rather than leaving it unknown.
let signing = "unsigned";
try {
  const output = run("codesign", ["-dv", "--verbose=4", appPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  signing = output.includes("Authority=") ? "signed" : "ad-hoc or unsigned";
} catch (error) {
  const text = `${error.stderr ?? ""}`;
  signing = /Authority=/.test(text)
    ? text.split("\n").find((line) => line.startsWith("Authority=")) ?? "signed"
    : "unsigned (no signature)";
}
console.log(`note: code signature -> ${signing}`);

// --------------------------------------------------- install it, and run it

// Rosetta translates an Intel binary on spawn with no help from the caller, so
// the only question is whether it is installed. Asking the system to run a
// trivial Intel binary answers it; looking for a path under /Library/Apple
// guesses at an implementation detail instead.
function hasRosetta() {
  if (process.arch !== "arm64") return false;
  try {
    run("/usr/bin/arch", ["-x86_64", "/usr/bin/true"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const plan = launchPlan({ archs, hostArch, hasRosetta: hasRosetta() });
if (!plan.launch) {
  // The build is fine; this machine cannot start it. Named as skips rather than
  // a note so the summary counts them, instead of reporting a full pass over a
  // run where the two checks that matter most never happened.
  skip("the installed app launches and loads a page", plan.why);
  skip("the packaged window is hardened against the page it loads", plan.why);
  console.log(
    `\n${checks - failures - skipped}/${checks} checks passed, ${skipped} skipped (this host cannot run this image)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
if (plan.translated) {
  console.log("note: Intel build on Apple Silicon, running under Rosetta 2.");
}

// Copy it out first, exactly as dragging to /Applications would: an app that
// only works while its read-only image is mounted is a broken app.
const installed = path.join(staged, appName);
run("cp", ["-R", appPath, installed]);
try {
  run("hdiutil", ["detach", mountPoint, "-quiet"]);
  mounted = false;
} catch {
  /* checked below by launching from the copy regardless */
}
check("the app copies out of the image", fs.existsSync(installed));

const pages = {
  "/": "<html><body><h1>Casparel</h1></body></html>",
};
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, ORIGIN).pathname;
  const body = pages[pathname];
  if (body === undefined) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": "text/html" }).end(body);
});

const launched = await new Promise((resolve) => {
  server.listen(PORT, "127.0.0.1", () => {
    const child = spawn(
      path.join(installed, "Contents", "MacOS", executableName),
      [],
      {
        env: {
          ...process.env,
          CASPAREL_URL: ORIGIN,
          // A real mode, not an invented one: an unrecognised value makes
          // reportSmokeResult fall through silently, so the check would wait
          // the full timeout and then call a healthy app broken. "hardening"
          // asks the loaded page whether it can reach Node, which cannot be
          // answered unless a window opened and rendered the page.
          CASPAREL_SMOKE: "hardening",
          CASPAREL_NO_UPDATE_CHECK: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let out = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
      server.close();
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, why: "no window reported a page within 60s", out }),
      60_000,
    );

    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.includes("SMOKE:")) finish({ ok: true, out });
    });
    child.stderr.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", (error) =>
      finish({ ok: false, why: `could not start: ${error.message}`, out }),
    );
    child.on("exit", (code, signal) => {
      if (out.includes("SMOKE:")) return finish({ ok: true, out });
      finish({
        ok: false,
        why: `exited early with code ${code}, signal ${signal}`,
        out,
      });
    });
  });
});

const verdict = smokeVerdict(launched.out ?? "");
const appOutput = (launched.out || "(nothing)")
  .trim()
  .split("\n")
  .map((line) => `     ${line}`)
  .join("\n");

check(
  "the installed app launches and loads a page",
  launched.ok,
  launched.ok ? "" : `${launched.why}\n     --- app output ---\n${appOutput}`,
);

// The window opened; separately, what did it say about itself?
//
// Three outcomes, not two, and the middle one cost a false alarm to learn.
// reportSmokeResult falls through to its embed scenario for any mode it does
// not recognise, so a build older than the hardening probe answers from that
// branch instead. desktop-v1.0.0 is exactly that -- built before the mode
// existed -- and reading its answer as a failed hardening check reported a
// security defect in an app with nothing wrong with it. A release check that
// cries wolf on the older releases it exists to check is worse than no check.
//
// "app-intact" is that branch's healthy answer, so it is a skip: nothing was
// measured, which is not the same as something being wrong.
//
// "window-lost" is NOT. It means the window ended on a data: URL -- the offline
// page -- so the app failed to load the page it was handed, and this script
// hands it a local server that answers. Skipping it would leave a hole: the
// launch check above passes on any SMOKE line at all, so a build that never
// loaded anything would report a launch and a skip and come out green.
//
// Everything else fails, including "node reachable from the page: ...", which
// is the finding the probe exists for. The classification is a pure function
// with the cases pinned down in smoke-verdict.test.mjs, so this reasoning is
// tested rather than asserted -- and testable at all, which it was not while it
// lived inside a script that exits on anything but macOS.
if (launched.ok) {
  const label = "the packaged window is hardened against the page it loads";
  const classified = classifySmokeVerdict(verdict);
  if (classified.kind === "hardened") {
    check(label, true);
  } else if (classified.kind === "unsupported") {
    skip(
      label,
      `this build predates the hardening hook: it answered "${verdict}", the ` +
        `embed scenario it falls back to for a mode it does not know. Cut a ` +
        `release from a commit that has the hook and this check runs.`,
    );
  } else {
    check(label, false, classified.reason);
  }
}

const passed = checks - failures - skipped;
console.log(
  `\n${passed}/${checks} checks passed` +
    (skipped ? `, ${skipped} skipped (this build cannot answer them)` : ""),
);
process.exit(failures === 0 ? 0 : 1);
