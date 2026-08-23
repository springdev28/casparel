#!/usr/bin/env node
/**
 * @fileOverview Desktop support role: configures or verifies Verify Package for the Electron distribution.
 * System connection: participates in packaging, installer metadata, or controlled-window smoke validation.
 */
/**
 * Checks what the Linux installers actually contain, after they are built.
 *
 * Everything here is invisible until someone installs the app, and invisible
 * even then unless you look in the right place. Both failures it exists for
 * came out of a build that reported success:
 *
 *   • `linux.icon` pointed at a single PNG, so the .deb installed one 1024px
 *     icon and every launcher, dock, alt-tab switcher and notification
 *     downscaled it.
 *   • a `desktop:` map written in the wrong shape was stringified into a
 *     literal `entry=[object Object]` line in the .desktop file.
 *
 * Neither is a build error. The only way to see either is to open the package
 * and read it, which is what this does.
 *
 * Usage:  node artifacts/desktop/scripts/verify-package.mjs [release-dir]
 */
import { execFileSync } from "node:child_process";
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

const deb = findOne(/\.deb$/);
const appImage = findOne(/\.AppImage$/);

if (!appImage) {
  fail("no .AppImage in the release directory: the portable Linux build did not happen");
}

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
    `Linux packages look installable (${[deb, appImage].filter(Boolean).map((f) => path.basename(f)).join(", ")}).`,
  );
  process.exit(0);
}

console.error(`\n${problems.length} problem(s) with the Linux packages:\n`);
for (const message of problems) console.error(`  • ${message}`);
console.error("");
process.exit(1);
