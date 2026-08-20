#!/usr/bin/env node
/**
 * Checks what the Linux packages actually contain, after they are built.
 *
 * Everything here is invisible until someone installs the app, and invisible
 * even then unless you look in the right place. The failures it exists for all
 * came out of a build that reported success:
 *
 *   • `linux.icon` pointed at a single PNG, so the .deb installed one 1024px
 *     icon and every launcher, dock, alt-tab switcher and notification
 *     downscaled it.
 *   • a `desktop:` map written in the wrong shape was stringified into a
 *     literal `entry=[object Object]` line in the .desktop file.
 *   • an arm64 package built on an x64 runner is produced by cross-packaging,
 *     and the way that goes wrong is that it succeeds: a package named arm64,
 *     declaring arm64, holding x86-64 binaries. Nothing fails until somebody
 *     on a Raspberry Pi installs it and it will not start.
 *
 * None of those is a build error. The only way to see any of them is to open
 * the package and read it, which is what this does.
 *
 * Usage:  node artifacts/desktop/scripts/verify-package.mjs [release-dir]
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.resolve(process.argv[2] ?? path.join(DESKTOP, "release"));

const problems = [];
const fail = (message) => problems.push(message);

/** The packaging description, which must not end up as user-facing copy. */
const PACKAGING_BLURB = /for macOS, Windows and Linux/i;

function findOne(pattern) {
  if (!fs.existsSync(releaseDir)) return null;
  return (
    fs
      .readdirSync(releaseDir)
      .filter((name) => pattern.test(name))
      .map((name) => path.join(releaseDir, name))[0] ?? null
  );
}

/**
 * Every package the Linux build is configured to produce.
 *
 * Named individually rather than derived from what is in the directory,
 * because the failure worth catching is one that is *missing*: a target that
 * silently stopped building leaves a release that is simply short an
 * architecture, and a check that reads the directory would call that a pass.
 *
 * The three spellings of each architecture are the packaging conventions, not
 * a choice: Debian says amd64/arm64, RPM says x86_64/aarch64, and
 * electron-builder names AppImages after the machine.
 */
const EXPECTED = [
  { format: "AppImage", arch: "x64", pattern: /-x86_64\.AppImage$/ },
  { format: "AppImage", arch: "arm64", pattern: /-arm64\.AppImage$/ },
  { format: "deb", arch: "x64", pattern: /-amd64\.deb$/ },
  { format: "deb", arch: "arm64", pattern: /-arm64\.deb$/ },
  { format: "rpm", arch: "x64", pattern: /-x86_64\.rpm$/ },
  { format: "rpm", arch: "arm64", pattern: /-aarch64\.rpm$/ },
  { format: "tar.gz", arch: "x64", pattern: /-x64\.tar\.gz$/ },
  { format: "tar.gz", arch: "arm64", pattern: /-arm64\.tar\.gz$/ },
];

/** e_machine values, at offset 18 of an ELF header. */
const ELF_MACHINE = { 0x3e: "x64", 0xb7: "arm64" };

/**
 * The architecture an ELF image was built for, from its header alone.
 *
 * Reading the header rather than shelling out to `file` keeps this working on
 * a runner that does not have it, and it is the same eighteen bytes either
 * way.
 */
function elfArch(bytes) {
  if (bytes.length < 20) return null;
  if (bytes.readUInt32BE(0) !== 0x7f454c46) return null; // \x7fELF
  return ELF_MACHINE[bytes.readUInt16LE(18)] ?? `unknown (0x${bytes.readUInt16LE(18).toString(16)})`;
}

function firstBytes(file, count = 64) {
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(count);
    fs.readSync(handle, buffer, 0, count, 0);
    return buffer;
  } finally {
    fs.closeSync(handle);
  }
}

/**
 * The architecture a built package will actually run on.
 *
 * Each format has to be opened its own way, and one of them does not have to
 * be opened at all: an AppImage *is* an ELF executable with the application
 * appended to it, so its own header is the answer. That matters here, because
 * the alternative -- running it with --appimage-extract -- is exactly what
 * cannot be done for the architecture this is checking.
 *
 * Returns null when the architecture could not be determined, which is
 * reported separately from a mismatch: "I could not tell" and "this is wrong"
 * are different answers and only one of them should fail a release.
 */
function packagedArch(file, format) {
  if (format === "AppImage") return elfArch(firstBytes(file));
  if (format === "tar.gz") {
    /*
     * Piped through `head` rather than buffered, because the executable being
     * examined is most of a hundred megabytes and the interesting part of it
     * is the first twenty bytes. tar is killed by the closed pipe and reports
     * failure for it, so the bytes are what is read here rather than the exit
     * status.
     */
    const result = spawnSync(
      "sh",
      ["-c", 'tar -xzOf "$1" --wildcards "*/casparel" 2>/dev/null | head -c 64', "sh", file],
      { maxBuffer: 1 << 16 },
    );
    return result.stdout?.length ? elfArch(result.stdout) : null;
  }
  if (format === "rpm") {
    // `rpm` ships with rpmbuild, which is what built this file, so querying it
    // adds no dependency the build did not already have.
    const arch = execFileSync("rpm", ["-qp", "--qf", "%{ARCH}", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return { x86_64: "x64", aarch64: "arm64" }[arch] ?? arch;
  }
  if (format === "deb") {
    const arch = execFileSync("dpkg-deb", ["-f", file, "Architecture"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return { amd64: "x64", arm64: "arm64" }[arch] ?? arch;
  }
  return null;
}

const built = [];
for (const expected of EXPECTED) {
  const file = findOne(expected.pattern);
  if (!file) {
    fail(
      `no ${expected.arch} ${expected.format} in the release directory: ` +
        `nobody on ${expected.arch} Linux can install Casparel from this release`,
    );
    continue;
  }
  built.push(file);
  let actual;
  try {
    actual = packagedArch(file, expected.format);
  } catch (error) {
    fail(
      `could not read the architecture of ${path.basename(file)}: ${String(error.message).trim().split("\n")[0]}`,
    );
    continue;
  }
  if (actual === null) {
    fail(`could not determine the architecture of ${path.basename(file)}`);
  } else if (actual !== expected.arch) {
    fail(
      `${path.basename(file)} is named ${expected.arch} but contains ${actual} binaries. ` +
        "A cross-packaged build produced the wrong payload, and it will not start on the machines it is offered to.",
    );
  }
}

const deb = findOne(/-amd64\.deb$/);

if (!deb) {
  fail("no .deb in the release directory: nothing to check");
} else {
  let unpacked;
  try {
    unpacked = fs.mkdtempSync(path.join(os.tmpdir(), "casparel-deb-"));
    execFileSync("dpkg-deb", ["-x", deb, unpacked], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    console.error(
      `Could not unpack ${path.basename(deb)} (${error.message.trim()}).\n` +
        "dpkg-deb comes with dpkg and is present on Debian, Ubuntu and GitHub's ubuntu runners.",
    );
    process.exit(2);
  }

  // ---- the applications-menu entry -------------------------------------
  const appsDir = path.join(unpacked, "usr", "share", "applications");
  const entryFile = fs.existsSync(appsDir)
    ? fs.readdirSync(appsDir).map((name) => path.join(appsDir, name))[0]
    : null;

  if (!entryFile) {
    fail("the package installs no .desktop file, so the app never appears in the applications menu");
  } else {
    const entry = fs.readFileSync(entryFile, "utf8");
    const value = (key) => entry.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";

    if (entry.includes("[object Object]")) {
      fail(
        `${path.basename(entryFile)} contains "[object Object]": a value in electron-builder.yml's linux.desktop was written in the wrong shape`,
      );
    }
    for (const key of ["Name", "Exec", "Icon", "Type", "Categories"]) {
      if (!value(key)) fail(`${path.basename(entryFile)} has no ${key}=`);
    }
    // Deep links are the shell's reason to exist alongside a browser tab. The
    // scheme is registered by this line and nothing else on Linux.
    if (!value("MimeType").includes("x-scheme-handler/casparel")) {
      fail(
        `${path.basename(entryFile)} does not claim x-scheme-handler/casparel, so casparel:// links will not open the app on Linux`,
      );
    }
    // Comment is the one line a user reads under the app name.
    const comment = value("Comment");
    if (!comment) {
      fail(`${path.basename(entryFile)} has no Comment=, so the menu entry says nothing about the app`);
    } else if (PACKAGING_BLURB.test(comment)) {
      fail(
        `${path.basename(entryFile)} shows the packaging blurb to users: "${comment}". A Linux applications menu is the wrong place to name two other operating systems.`,
      );
    }
  }

  // ---- icons -----------------------------------------------------------
  const iconRoot = path.join(unpacked, "usr", "share", "icons", "hicolor");
  const sizes = fs.existsSync(iconRoot)
    ? fs
        .readdirSync(iconRoot)
        .map((name) => Number.parseInt(name, 10))
        .filter((size) => Number.isFinite(size))
        .sort((a, b) => a - b)
    : [];

  if (sizes.length === 0) {
    fail("the package installs no icons under hicolor/");
  } else if (sizes.length === 1) {
    fail(
      `only one icon size is installed (${sizes[0]}px). Linux picks the nearest size rather than scaling well, so set linux.icon to a directory of sizes instead of a single file.`,
    );
  } else if (!sizes.includes(48) || !sizes.includes(256)) {
    fail(
      `installed icon sizes are ${sizes.join(", ")}; 48 and 256 are the two every desktop environment asks for`,
    );
  }

  // ---- package metadata ------------------------------------------------
  const control = execFileSync("dpkg-deb", ["-I", deb], { encoding: "utf8" });
  if (/^\s*License:\s*unknown\s*$/m.test(control)) {
    fail("the .deb declares License: unknown. Set `license` in artifacts/desktop/package.json.");
  }

  fs.rmSync(unpacked, { recursive: true, force: true });
}

if (problems.length === 0) {
  console.log(
    `${built.length} Linux packages look installable, each for the architecture it names:\n` +
      built.map((file) => `  ${path.basename(file)}`).join("\n"),
  );
  process.exit(0);
}

console.error(`\n${problems.length} problem(s) with the Linux packages:\n`);
for (const message of problems) console.error(`  • ${message}`);
console.error("");
process.exit(1);
