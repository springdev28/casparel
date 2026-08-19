#!/usr/bin/env node
/**
 * Installs a built .exe the way a person would, and checks the application it
 * installs actually starts.
 *
 * The Windows counterpart of verify-app-macos.mjs, and the last platform where
 * nothing had ever run what ships. The Linux .deb is unpacked, the macOS .dmg
 * is mounted and launched; the Windows installer was only ever produced.
 *
 * That is the platform where it matters most, because it is the one nobody on
 * this project can check by hand: neither Windows nor macOS can be built or run
 * anywhere else here, and unlike macOS there is not even a developer machine.
 * A hosted runner is the only thing that can answer it.
 *
 * What a green build does not tell you: whether the installer runs to
 * completion, whether it puts an executable where it says, whether that
 * executable carries the right version and publisher metadata, whether the
 * casparel:// scheme is registered so deep links arrive, whether an uninstaller
 * exists, and whether the installed application opens a window at all.
 *
 *   node scripts/verify-app-windows.mjs [path/to/Casparel.exe]
 *
 * With no argument it takes the .exe from release/ that matches this machine's
 * architecture. Exit 0 all good, 1 a real defect, 75 the check could not be
 * performed (not Windows, no installer to test).
 *
 * A check can also be SKIPPED, which is neither. This runs against a published
 * release, so the script is always newer than the application it installs and
 * can ask questions that build has no code to answer. Reporting those as
 * defects is a lie about the shipped build. Skips are named with their reason
 * and do not affect the exit code.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifySmokeVerdict, smokeVerdict } from "./smoke-verdict.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXIT_INCONCLUSIVE = 75;
const PORT = 4462;
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

function skip(label, why) {
  checks += 1;
  skipped += 1;
  console.log(`skip ${label}\n     ${why}`);
}

function inconclusive(why) {
  console.log(`\nCannot verify: ${why}`);
  process.exit(EXIT_INCONCLUSIVE);
}

/** PowerShell, because the things worth reading here are Windows metadata. */
function powershell(script) {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    // stderr is captured rather than inherited: a probe that fails is reported
    // in the check's own words, not as a wall of PowerShell noise in the middle
    // of the results.
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

if (process.platform !== "win32") {
  inconclusive(
    `an .exe installer can only be run on Windows; this is ${process.platform}.`,
  );
}

// ------------------------------------------------------------ the installer

const hostArch = process.arch === "arm64" ? "arm64" : "x64";

function findInstaller() {
  const explicit = process.argv[2];
  if (explicit) return path.resolve(explicit);
  const releaseDir = path.join(ROOT, "release");
  if (!fs.existsSync(releaseDir)) return null;
  const installers = fs
    .readdirSync(releaseDir)
    .filter((name) => name.endsWith(".exe"));
  // The one this machine can execute. The combined installer (no arch in the
  // name) works too, so it is the fallback rather than the first choice.
  const matching =
    installers.find((name) => name.includes(hostArch)) ??
    installers.find((name) => !/-(x64|arm64|ia32)\./.test(name)) ??
    installers[0];
  return matching ? path.join(releaseDir, matching) : null;
}

const installer = findInstaller();
if (!installer || !fs.existsSync(installer)) {
  inconclusive("no .exe was given and none was found in release/.");
}
console.log(`Installer: ${installer}`);
console.log(`Host:      Windows ${os.release()} ${hostArch}\n`);

const expectedVersion = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
).version;

// ------------------------------------------------- what the installer claims

// SignPath's condition 17 is about exactly this: a signed binary has to carry
// metadata, and metadata that is absent or wrong is a defect whether or not
// anything is signed yet.
let installerInfo = {};
try {
  installerInfo = JSON.parse(
    powershell(
      `(Get-Item -LiteralPath '${installer}').VersionInfo | ` +
        `Select-Object ProductName,FileVersion,ProductVersion,LegalCopyright | ConvertTo-Json`,
    ),
  );
} catch (error) {
  check("the installer carries version metadata", false, String(error.message).trim());
}

check(
  "the installer's product name is Casparel",
  installerInfo.ProductName === "Casparel",
  `VersionInfo says ${JSON.stringify(installerInfo.ProductName)}`,
);
check(
  `the installer's version is ${expectedVersion}`,
  (installerInfo.ProductVersion ?? "").startsWith(expectedVersion),
  `VersionInfo says ${JSON.stringify(installerInfo.ProductVersion)}, package.json says ${expectedVersion}`,
);
check(
  "the installer declares a copyright",
  Boolean(installerInfo.LegalCopyright),
  "LegalCopyright is empty, so the file's Properties tab shows no owner",
);

// Reported, never failed on. There is deliberately no certificate today; the
// point is that a run says which it was.
//
// "Not signed" and "could not tell" are different answers and this must not
// collapse them. The first version did, and always printed "unknown", because
// Get-AuthenticodeSignature lives in Microsoft.PowerShell.Security and that
// module does not auto-load on a GitHub runner -- so the call threw and the
// fallback swallowed it. Signing is the whole point of the work this check
// supports; a probe stuck on "unknown" would go on saying it after a
// certificate was in place, and nobody would notice signing had silently
// stopped working. So the module is imported explicitly, and a probe that
// still fails says so in those words.
// Two hosts are tried, because Windows PowerShell 5.1 on a GitHub runner
// refuses to load Microsoft.PowerShell.Security even when asked explicitly,
// while PowerShell 7 (pwsh, also present) carries the cmdlet without argument.
// Whichever answers first is used; if neither does, that is reported as not
// having been determined, with the reason.
function readAuthenticodeStatus(file) {
  const script = `(Get-AuthenticodeSignature -LiteralPath '${file}').Status`;
  const attempts = [
    ["pwsh", ["-NoProfile", "-NonInteractive", "-Command", script]],
    [
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Import-Module Microsoft.PowerShell.Security -ErrorAction Stop; ${script}`,
      ],
    ],
  ];
  const reasons = [];
  for (const [command, args] of attempts) {
    try {
      const status = execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      if (status) return { status, via: command };
    } catch (error) {
      reasons.push(`${command}: ${String(error.message).split("\n")[0].trim()}`);
    }
  }
  return { status: null, reasons };
}

const signing = readAuthenticodeStatus(installer);
console.log(
  signing.status
    ? `note: Authenticode status -> ${signing.status} (via ${signing.via})`
    : `note: Authenticode status -> could not be determined; every probe failed` +
        `\n      ${signing.reasons.join("\n      ")}`,
);

// ----------------------------------------------------------------- install it

// A path with no spaces, deliberately: NSIS takes /D as the LAST argument and
// unquoted, so a directory with a space in it silently truncates the target.
const target = path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "casparel-app");
fs.rmSync(target, { recursive: true, force: true });

let installed = false;
let installError = "";
try {
  // /S is NSIS silent mode. It works for an assisted installer (oneClick is
  // false here) as well as a one-click one.
  execFileSync(installer, ["/S", `/D=${target}`], { stdio: "inherit" });
  installed = true;
} catch (error) {
  installError = String(error.message).trim();
}
check("the installer runs to completion", installed, installError);

function cleanUp() {
  const uninstaller = fs.existsSync(target)
    ? fs.readdirSync(target).find((name) => /^Uninstall .*\.exe$/i.test(name))
    : null;
  if (uninstaller) {
    try {
      execFileSync(path.join(target, uninstaller), ["/S"], { stdio: "ignore" });
    } catch {
      /* the runner is disposable; a stuck uninstall is not a product defect */
    }
  }
}
process.on("exit", cleanUp);

if (!installed) {
  console.log(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}

// ------------------------------------------------------- what it put on disk

const contents = fs.existsSync(target) ? fs.readdirSync(target) : [];
check(
  "it installed something into the chosen directory",
  contents.length > 0,
  `${target} is empty or absent, so /D was not honoured`,
);

// electron-builder.yml sets executableName: casparel, so this is casparel.exe
// rather than Casparel.exe -- the kind of detail that only bites once somebody
// installs the thing.
const appExeName = contents.find(
  (name) => name.toLowerCase().endsWith(".exe") && !/^Uninstall /i.test(name),
);
check(
  "the application executable is present",
  Boolean(appExeName),
  `saw: ${contents.filter((n) => n.endsWith(".exe")).join(", ") || "(no .exe)"}`,
);

check(
  "an uninstaller is present",
  contents.some((name) => /^Uninstall .*\.exe$/i.test(name)),
  "nothing to remove the app with, which Windows and SignPath both expect",
);

// The casparel:// registration is checked AFTER the launch, further down, not
// here. Windows and macOS differ in a way that is easy to get wrong: the .app
// declares its schemes in Info.plist, so the macOS check can read them off the
// bundle without running anything, but on Windows the app registers itself at
// runtime with setAsDefaultProtocolClient when it first becomes ready. Looking
// in the registry straight after install therefore finds nothing and reports a
// defect in a perfectly good build -- which is exactly what the first version
// of this script did.
function protocolIsRegistered() {
  try {
    return (
      powershell(
        `if (Test-Path 'HKCU:\\Software\\Classes\\casparel') { 'yes' } else { 'no' }`,
      ) === "yes"
    );
  } catch {
    return false;
  }
}

check(
  "the scheme is not registered before the app has ever run",
  !protocolIsRegistered(),
  "something already claimed casparel:// on this machine, so the check below " +
    "would pass without the app having done anything",
);

if (!appExeName) {
  console.log(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
const appExe = path.join(target, appExeName);

// --------------------------------------------------------------- run it

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, ORIGIN).pathname;
  if (pathname !== "/") {
    response.writeHead(404).end("not found");
    return;
  }
  response
    .writeHead(200, { "content-type": "text/html" })
    .end("<html><body><h1>Casparel</h1></body></html>");
});

const launched = await new Promise((resolve) => {
  server.listen(PORT, "127.0.0.1", () => {
    const child = spawn(appExe, [], {
      env: {
        ...process.env,
        CASPAREL_URL: ORIGIN,
        CASPAREL_SMOKE: "hardening",
        CASPAREL_NO_UPDATE_CHECK: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      server.close();
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, why: "no window reported a page within 90s", out }),
      90_000,
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

// Now that the app has been ready once, it should have claimed the scheme.
// This is the stronger form of the check: not "the installer wrote a registry
// key" but "the application actually registers itself", which is what has to be
// true for a casparel:// link to open it.
if (launched.ok) {
  check(
    "running the app registers the casparel:// scheme",
    protocolIsRegistered(),
    "HKCU\\Software\\Classes\\casparel is still absent after a successful " +
      "launch, so deep links will not reach the app",
  );
}

// Same three outcomes as the macOS check, through the same tested classifier:
// a build older than the hardening probe answers from the shell's embed
// fall-through and cannot be asked the question, which is a skip rather than an
// accusation -- while "window-lost" and a reachable Node stay failures.
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
