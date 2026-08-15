import fs from "node:fs";

/**
 * Find a Chromium the local Playwright can actually launch.
 *
 * Two environments, two answers. This sandbox preinstalls a browser at a fixed
 * path and sets PLAYWRIGHT_BROWSERS_PATH; a GitHub runner has neither, and
 * instead lets `playwright install chromium` manage its own copy, which
 * Playwright then finds on its own when no executablePath is passed.
 *
 * Passing a path that does not exist is the one thing that breaks both:
 * audit-session.mjs hardcoded the sandbox path as its fallback, so it launched
 * fine locally and failed every CI run with "executable doesn't exist" -
 * which blocked four consecutive deploys while the site itself was healthy.
 *
 * Returning undefined is therefore the correct answer when nothing is found,
 * not an error: it hands the decision back to Playwright.
 */
/** Where preinstalled browsers live in images that ship one. */
export const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";

/** Candidates in priority order. Exported so the fall-through can be tested. */
export function chromiumCandidates(env = process.env) {
  return [
    env.CHROMIUM_PATH,
    env.PLAYWRIGHT_BROWSERS_PATH ? `${env.PLAYWRIGHT_BROWSERS_PATH}/chromium` : null,
    PREINSTALLED_CHROMIUM,
  ].filter(Boolean);
}

export function chromiumExecutable(env = process.env, exists = fs.existsSync) {
  for (const candidate of chromiumCandidates(env)) {
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

/** Launch options shared by every audit script. */
export function launchOptions(env = process.env, exists = fs.existsSync) {
  const executablePath = chromiumExecutable(env, exists);
  return {
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox"],
  };
}
