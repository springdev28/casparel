#!/usr/bin/env node
/**
 * @fileOverview Mobile support role: configures or implements Check Release Config for the Expo application.
 * System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.
 */
/**
 * Checks the things that decide whether a store build is submittable, before
 * anybody spends twenty minutes of EAS build time finding out.
 *
 * Every rule here exists because getting it wrong is expensive and silent: the
 * build succeeds, the app installs, and the failure shows up at upload (App
 * Store Connect refusing an icon with an alpha channel), at review (a camera
 * permission the app never uses), or — worst — on a reviewer's phone, where a
 * missing `EXPO_PUBLIC_*` value means every request goes nowhere and the app
 * looks broken rather than misconfigured.
 *
 * Offline and dependency-free on purpose, so it can run on every pull request
 * next to the type check rather than only at release time.
 *
 * Usage:  node artifacts/mobile/scripts/check-release-config.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(MOBILE, "..", "..");

const problems = [];
const notes = [];

const fail = (message) => problems.push(message);
const note = (message) => notes.push(message);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${path.relative(REPO, file)} is not readable JSON: ${error.message}`);
    return null;
  }
}

/**
 * PNG header facts, straight out of IHDR — no decoder needed, and no
 * dependency to keep current for four numbers.
 */
function pngHeader(file) {
  const buffer = Buffer.alloc(26);
  const handle = fs.openSync(file, "r");
  try {
    fs.readSync(handle, buffer, 0, 26, 0);
  } finally {
    fs.closeSync(handle);
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) return null;
  const colourType = buffer[25];
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    // Colour types 4 (grey+alpha) and 6 (truecolour+alpha) carry a channel;
    // 3 (palette) can carry transparency in a tRNS chunk, which is not looked
    // for here because nothing in this project produces one.
    hasAlpha: colourType === 4 || colourType === 6,
  };
}

function checkImage(label, relativeToApp, { square = true, minSize = 1024, alpha } = {}) {
  const file = path.resolve(MOBILE, relativeToApp);
  const shown = path.relative(REPO, file);
  if (!fs.existsSync(file)) {
    fail(`${label}: ${relativeToApp} is referenced by app.json but does not exist`);
    return;
  }
  const header = pngHeader(file);
  if (!header) {
    fail(`${label}: ${shown} is not a PNG`);
    return;
  }
  if (square && header.width !== header.height) {
    fail(`${label}: ${shown} is ${header.width}×${header.height}, and must be square`);
  }
  if (header.width < minSize || header.height < minSize) {
    fail(
      `${label}: ${shown} is ${header.width}×${header.height}, below the ${minSize}px both stores ask for`,
    );
  }
  if (alpha === false && header.hasAlpha) {
    fail(
      `${label}: ${shown} carries an alpha channel. App Store Connect rejects the app icon for this at upload — regenerate with artifacts/mobile/scripts/build-icons.mjs`,
    );
  }
}

// ---------------------------------------------------------------------------
// app.json — what the built app declares about itself
// ---------------------------------------------------------------------------

const appJsonPath = path.join(MOBILE, "app.json");
const app = readJson(appJsonPath)?.expo;

if (app) {
  for (const field of ["name", "slug", "version", "scheme", "icon"]) {
    if (!app[field]) fail(`app.json: expo.${field} is required and is missing`);
  }

  if (app.version && !/^\d+\.\d+\.\d+$/.test(app.version)) {
    fail(
      `app.json: expo.version is "${app.version}"; both stores want three numeric parts, e.g. 1.0.0`,
    );
  }

  const bundleId = app.ios?.bundleIdentifier;
  const androidPackage = app.android?.package;
  if (!bundleId) fail("app.json: expo.ios.bundleIdentifier is required to build for iOS");
  if (!androidPackage) fail("app.json: expo.android.package is required to build for Android");
  if (bundleId && androidPackage && bundleId !== androidPackage) {
    note(
      `iOS bundle id (${bundleId}) and Android package (${androidPackage}) differ. Legal, but they are the app's identity in two stores and diverge by accident more often than on purpose.`,
    );
  }

  // With eas.json on `appVersionSource: "remote"` these are decided by EAS at
  // build time. Leaving them here reads as if they were still authoritative.
  if (app.ios?.buildNumber !== undefined) {
    fail(
      "app.json: expo.ios.buildNumber is set, but eas.json takes the build number from EAS (appVersionSource: remote). Remove it so there is one answer.",
    );
  }
  if (app.android?.versionCode !== undefined) {
    fail(
      "app.json: expo.android.versionCode is set, but eas.json takes the version code from EAS (appVersionSource: remote). Remove it so there is one answer.",
    );
  }

  if (app.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === undefined) {
    fail(
      "app.json: expo.ios.infoPlist.ITSAppUsesNonExemptEncryption is unset, so every single App Store upload stops to ask about export compliance before it can be submitted.",
    );
  }

  if (app.icon) checkImage("app icon", app.icon, { alpha: false });

  const adaptive = app.android?.adaptiveIcon;
  if (!adaptive?.foregroundImage) {
    fail(
      "app.json: expo.android.adaptiveIcon.foregroundImage is missing. Android masks the icon to the launcher's shape, and without an adaptive icon the artwork is cropped to whatever fits.",
    );
  } else {
    checkImage("Android adaptive icon", adaptive.foregroundImage);
    if (!/^#[0-9a-fA-F]{6}$/.test(adaptive.backgroundColor ?? "")) {
      fail(
        "app.json: expo.android.adaptiveIcon.backgroundColor must be a #rrggbb colour — it is what shows around the foreground under every launcher mask.",
      );
    }
  }

  // Permissions the app cannot use are a review question at best and a
  // data-safety declaration at worst. Nothing here records or photographs.
  const blocked = new Set(app.android?.blockedPermissions ?? []);
  for (const permission of ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"]) {
    if (!blocked.has(permission)) {
      fail(
        `app.json: ${permission} is not in expo.android.blockedPermissions. expo-image-picker adds it by default, and Casparel only ever reads the photo library.`,
      );
    }
  }

  const plugins = (app.plugins ?? []).map((entry) =>
    Array.isArray(entry) ? entry[0] : entry,
  );
  const pkg = readJson(path.join(MOBILE, "package.json"));
  // A config plugin that is not listed does nothing, and the symptom is a
  // native permission string or entitlement quietly missing from the build.
  for (const plugin of ["expo-image-picker", "expo-secure-store", "expo-splash-screen"]) {
    if (pkg?.dependencies?.[plugin] && !plugins.includes(plugin)) {
      fail(
        `app.json: ${plugin} is a dependency but is not in expo.plugins, so its native configuration is not applied to the build.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// eas.json — what the build machine is told
// ---------------------------------------------------------------------------

const easPath = path.join(MOBILE, "eas.json");
const eas = readJson(easPath);

/** A profile's effective env, following `extends` the way EAS does. */
function profileEnv(name, seen = new Set()) {
  const profile = eas?.build?.[name];
  if (!profile || seen.has(name)) return {};
  seen.add(name);
  const inherited = profile.extends ? profileEnv(profile.extends, seen) : {};
  return { ...inherited, ...(profile.env ?? {}) };
}

const shippingProfiles = ["development", "preview", "production"];

if (eas) {
  if (eas.cli?.appVersionSource !== "remote" && eas.cli?.appVersionSource !== "local") {
    fail(
      'eas.json: cli.appVersionSource must be "remote" or "local"; EAS refuses to build without an answer.',
    );
  }

  for (const name of shippingProfiles) {
    if (!eas.build?.[name]) {
      fail(`eas.json: build profile "${name}" is missing`);
      continue;
    }
    if (!profileEnv(name).EXPO_PUBLIC_DOMAIN) {
      fail(
        `eas.json: build profile "${name}" does not set EXPO_PUBLIC_DOMAIN, so the build falls back to the default host in utils/api-host.ts rather than the one this profile is for.`,
      );
    }
  }

  // An .aab cannot be installed by a tester; it can only be uploaded to Play.
  // A profile marked for internal distribution that produces one is a build
  // nobody can open.
  for (const name of shippingProfiles) {
    const profile = eas.build?.[name];
    if (profile?.distribution === "internal" && profile?.android?.buildType !== "apk") {
      fail(
        `eas.json: build profile "${name}" distributes internally but does not set android.buildType to "apk". An app bundle can only be uploaded to Play, not installed from a link.`,
      );
    }
  }

  if (!eas.submit?.production?.android) {
    fail("eas.json: submit.production.android is missing, so `eas submit` cannot reach Play.");
  }
  if (!eas.submit?.production?.ios) {
    fail(
      "eas.json: submit.production.ios is missing, so `eas submit` cannot reach App Store Connect.",
    );
  }
}

// ---------------------------------------------------------------------------
// EXPO_PUBLIC_* — inlined at bundle time, so an unset one is unset forever
// ---------------------------------------------------------------------------

function sourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) found.push(full);
  }
  return found;
}

const referenced = new Set();
for (const file of sourceFiles(MOBILE)) {
  // The build script and this checker talk about these names rather than
  // reading them as configuration.
  if (file.startsWith(path.join(MOBILE, "scripts"))) continue;
  for (const match of fs.readFileSync(file, "utf8").matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) {
    referenced.add(match[0]);
  }
}

const envExample = fs.existsSync(path.join(MOBILE, ".env.example"))
  ? fs.readFileSync(path.join(MOBILE, ".env.example"), "utf8")
  : "";
const buildScript = fs.existsSync(path.join(MOBILE, "scripts", "build.js"))
  ? fs.readFileSync(path.join(MOBILE, "scripts", "build.js"), "utf8")
  : "";
const easEnvNames = new Set(
  shippingProfiles.flatMap((name) => Object.keys(profileEnv(name))),
);

for (const name of [...referenced].sort()) {
  const supplied =
    easEnvNames.has(name) ||
    envExample.includes(name) ||
    // Supplied by the Replit dev workflow rather than by a build profile.
    buildScript.includes(name);
  if (!supplied) {
    fail(
      `${name} is read by the app but is set nowhere: not in eas.json, not documented in .env.example. A store build would inline it as undefined.`,
    );
  }
}

// ---------------------------------------------------------------------------

for (const message of notes) console.log(`note: ${message}`);

if (problems.length === 0) {
  console.log(
    `Mobile release configuration looks submittable (${referenced.size} EXPO_PUBLIC_* values accounted for).`,
  );
  process.exit(0);
}

console.error(`\n${problems.length} problem(s) with the mobile release configuration:\n`);
for (const message of problems) console.error(`  • ${message}`);
console.error("");
process.exit(1);
