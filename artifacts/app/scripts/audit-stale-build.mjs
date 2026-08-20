#!/usr/bin/env node
/**
 * A tab that was open when a new version shipped does not go blank.
 *
 * Every page in this app is a `lazy(() => import(...))`, and a deploy replaces
 * the previous build's hashed chunks. So a tab somebody left open is running a
 * shell that names files which were deleted minutes ago, and it asks for one
 * the moment they click through to a page they had not opened yet.
 *
 * There were thirteen deploys on the day this was written.
 *
 * Two things went wrong, and this drives both of them:
 *
 *  - The server answered a missing file with index.html at HTTP 200. The
 *    browser had asked for a module, so it parsed `<!DOCTYPE html>` as
 *    JavaScript and stopped. React never mounted: an empty <div id="root">, no
 *    error boundary -- there is no React yet to have one -- so no message, no
 *    reload button, nothing but a syntax error pointing at a line of markup.
 *    That is fixed in app.ts, but a tab running an older build is running the
 *    old behaviour with it, so the app still has to survive it.
 *  - Even answered honestly with a 404, the dynamic import rejects. That
 *    reaches the error boundary, which now recognises it and reloads once --
 *    the one failure the app can genuinely fix by itself, because the fix is
 *    to fetch the current shell.
 *
 * Both cases are simulated here by intercepting the chunk after the shell has
 * loaded, which is exactly the order a deploy makes them happen in.
 *
 *   node scripts/audit-stale-build.mjs
 *
 * Exit codes: 0 recovered, 1 went blank, 2 the run could not look.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSession } from "./audit-fixtures.mjs";
import { launchOptions } from "./chromium.mjs";
import { serveBuild } from "./serve-build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../dist/public");
const PORT = Number(process.env.AUDIT_STALE_PORT ?? 4336);

/**
 * The page to click through to, and the chunk it needs.
 *
 * A route the first screen does not already have in memory: the point is a
 * chunk that has to be fetched at click time, which is the only kind a deploy
 * can pull out from under a reader.
 */
const TARGET = "/resources";
const CHUNK = /\/assets\/ResourcesPage-[^/]+\.js$/;

if (!fs.existsSync(ROOT)) {
  console.error(`No build found at ${ROOT}. Run the app build first.`);
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error("playwright-core is not installed.");
  process.exit(2);
}

const server = serveBuild(ROOT, PORT);
const browser = await chromium.launch(launchOptions());
const failures = [];

/**
 * @param {string} name
 * @param {(route: import("playwright-core").Route) => Promise<void>} answer
 *   how the vanished chunk is answered
 * @param {{persistent?: boolean}} [options]
 *   persistent: the chunk never comes back, which is not a deploy but a
 *   genuinely broken server. The app must stop and say so rather than reload
 *   at it forever.
 */
async function check(name, answer, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await installSession(context, { language: "en" });
  const page = await context.newPage();

  // The shell loads normally: this tab was working a moment ago.
  await page.goto(`http://127.0.0.1:${PORT}/dashboard`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.waitForTimeout(500);

  // And now the deploy happens underneath it.
  let deployed = true;
  let asked = 0;
  await context.route(CHUNK, async (route) => {
    asked += 1;
    if (deployed) {
      await answer(route);
      return;
    }
    await route.continue();
  });

  /*
   * The reload the boundary performs has to find the *new* build, or the
   * recovery is a loop rather than a fix. A real deploy leaves a working
   * server behind; this releases the interception once the tab gives up on
   * the old chunk, which is the same thing from the page's point of view.
   */
  let loads = 0;
  page.on("load", () => {
    loads += 1;
    if (!options.persistent) deployed = false;
  });

  await page.evaluate((target) => {
    // Client-side, the way a reader gets there: no full navigation, so the
    // shell in memory is the one that has to fetch the chunk.
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, TARGET);

  // Long enough for the import to fail, the boundary to reload, and the
  // reloaded page to paint.
  await page.waitForTimeout(6000);

  const seen = await page.evaluate(() => ({
    text: (document.body?.innerText ?? "").trim(),
    root: document.getElementById("root")?.innerHTML.length ?? -1,
  }));

  // Two loads is one recovery: the tab's own load, then the reload. More than
  // that is the app reloading at a wall.
  if (options.persistent && loads > 2) {
    failures.push(
      `${name}: reloaded ${loads} times. A chunk that is missing for good is ` +
        `a broken server, not a deploy, and reloading at it is a loop that ` +
        `burns somebody's battery and never resolves.`,
    );
  }

  const blank = seen.root <= 0 || seen.text.length < 20;
  const recovered = /Resources|Library|Search/i.test(seen.text);
  const explained = /Casparel has been updated|Reload app/i.test(seen.text);

  if (blank) {
    failures.push(
      `${name}: the tab went blank (#root ${seen.root} chars). This is the ` +
        `failure with no message and no way out: a reader sees an empty ` +
        `window and the tab still spinning.`,
    );
  } else if (options.persistent) {
    // Nothing to recover to, so the honest outcome is the message and a
    // button -- and above all, not a blank window.
    if (!explained) {
      failures.push(
        `${name}: neither recovered nor explained: ` +
          `${JSON.stringify(seen.text.slice(0, 120))}`,
      );
    }
  } else if (!recovered) {
    /*
     * An explanation is not good enough here, which is the whole point of
     * asking for the page rather than for "not blank".
     *
     * A lazy chunk that is gone is the one failure the app can fix without
     * anybody's help: the current shell is one no-cache request away, and
     * fetching it is what a reload does. Somebody who clicked Resources
     * should land on Resources. Stopping to tell them the app was updated and
     * asking them to press a button is a worse version of the same recovery,
     * and it is what this looked like before the boundary learned to
     * recognise the error -- so if that is all that happens, the recognition
     * has stopped working.
     */
    failures.push(
      `${name}: did not recover on its own -- ${
        explained
          ? "it explained the problem and waited for a click, which means the " +
            "boundary no longer recognises a vanished chunk"
          : `it rendered ${JSON.stringify(seen.text.slice(0, 120))}`
      }`,
    );
  }

  const ok = options.persistent ? explained && loads <= 2 : recovered;
  console.log(
    `  ${ok ? "ok " : "!! "} ${name}: ` +
      (blank
        ? "blank"
        : recovered
          ? "reloaded itself and rendered the page"
          : "explained it and waited for a click") +
      ` (chunk asked for ${asked}x, ${loads} load${loads === 1 ? "" : "s"})`,
  );
  await context.close();
}

// The old server behaviour, which a tab on an older build still meets.
await check("a vanished chunk answered with the page shell", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fs.readFileSync(path.join(ROOT, "index.html"), "utf8"),
  });
});

// What the server does now.
await check("a vanished chunk answered with a 404", async (route) => {
  await route.fulfill({
    status: 404,
    contentType: "text/plain; charset=utf-8",
    body: "Not found",
  });
});

// And the case that is not a deploy: a chunk that is simply never there.
await check(
  "a chunk that never comes back",
  async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Not found",
    });
  },
  { persistent: true },
);

await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  "\nA tab open across a deploy reloads itself onto the new build, whether " +
    "the server answers the missing chunk honestly or with a page; a chunk " +
    "that never comes back stops and says so instead of looping.",
);
