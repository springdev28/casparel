#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Audit Offline behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * What the app says when it cannot reach the server.
 *
 * It used to say the person had nothing. The schedule drew "No plans" against
 * all seven days of a week it had failed to fetch; classes said "You haven't
 * joined any classes yet"; goals said "Your path is empty" and, in the
 * community section, "No community paths yet -- Share one of your goals to
 * start the community library"; the dashboard reported "No mastery evidence ·
 * No active goal" above prompts to begin. Every one of those is a claim about
 * the reader's own work, and every one was reached without asking.
 *
 * The schedule is the one somebody acts on. A pupil checking tomorrow on a bus
 * sees a free afternoon, and either re-adds a block they already have or walks
 * away believing they have nothing on.
 *
 * Nothing catches it, which is the point of this file. An empty state is what
 * a healthy new account is supposed to show, so every fixture-backed render,
 * screenshot and unit test agrees it is correct. The only way to see the bug
 * is to break the network and read the page.
 *
 * The check is deliberately narrow: with every API call aborted, each page has
 * to render the shared failure block. What that block says is
 * components/LoadFailure.tsx's business, and it is translated.
 *
 *   pnpm --filter @workspace/app run build   # dist/public must exist
 *   node artifacts/app/scripts/audit-offline.mjs
 *
 * Exit 0 all good, 1 a page claims emptiness it cannot know, 75 the run could
 * not be performed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchOptions } from "./chromium.mjs";
import { installSession } from "./audit-fixtures.mjs";
import { serveBuild } from "./serve-build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/public");
const EXIT_INCONCLUSIVE = 75;

/**
 * Pages whose whole content is the reader's own data.
 *
 * A page that mostly holds controls -- /settings, /catalog search -- has
 * nothing to be wrong about when a request fails, so it is not listed. Each of
 * these makes a statement about what the reader has, and a statement made
 * without asking is a false one.
 *
 * The list started at five and grew with the app: Learning Lists, study sets
 * and canvases each say "you have none of these" and each arrived after this
 * file was written. The library is here for the reason audit-loading.mjs
 * exists at all -- "Your library is empty" is the sentence that started this.
 */
/**
 * What each page says when it has nothing, and must not say while it is still
 * asking.
 *
 * Curated rather than derived, because on the web these sentences are written
 * into each page and sit alongside phrases that are legitimately about
 * nothing -- "No named author or institution" is a credibility label, "No
 * reason recorded." is a moderation field. A list scraped from the source
 * would report both as claims about the reader.
 */
const EMPTY_SENTENCE = {
  "/dashboard": "No mastery evidence",
  "/schedule": "No plans",
  "/classes": "You haven't joined any classes yet",
  "/goals": "Your path is empty",
  "/lists": "No lists yet",
  "/activities": "No study activities yet",
  "/canvases": "Start with a blank canvas",
  "/resources?view=library": "Your library is empty",
  "/lists/44": "List not found",
  "/resources/101": "Resource not found",
};

const PAGES = [
  "/dashboard",
  "/schedule",
  "/classes",
  "/goals",
  "/profile",
  "/lists",
  "/activities",
  "/canvases",
  /*
   * The library, addressed directly. This page opens on the public catalogue
   * search, which has nothing to be wrong about when a request fails -- it is
   * the same page for a signed-out visitor. The library half is the half that
   * makes a claim about the reader, and "Your library is empty" is the
   * sentence audit-loading.mjs was written for.
   */
  "/resources?view=library",
  /*
   * The detail pages, which make the sharpest claim of all: "not found". A
   * list that could not be fetched has not been deleted, and telling somebody
   * it is gone is worse than telling them nothing -- they go and make another.
   * The ids are the fixture set's own, so each page has something real to
   * fail at fetching.
   */
  "/lists/44",
  "/resources/101",
];

/**
 * Two ways of not answering, because the app tells them apart and so does a
 * person: nothing came back at all, and something came back saying the server
 * broke. They are different branches of LoadFailure, and only the first had
 * ever been rendered here.
 */
const FAILURES = [
  {
    name: "waiting",
    describe: "the server has not answered yet",
    /*
     * Held open, never answered and never refused. Nothing has failed, so a
     * page that has reached its empty state has jumped to a conclusion: "No
     * lists yet" while the request is in flight is the same claim as showing
     * it after the request failed, a second or two earlier.
     */
    install: (context) => context.route("**/api/**", () => {}),
    expect: "waiting",
  },
  {
    name: "offline",
    describe: "nothing reaches the server",
    install: (context) =>
      context.route("**/api/**", (route) => route.abort("connectionfailed")),
  },
  {
    name: "broken",
    describe: "the server answers 500",
    install: (context) =>
      context.route("**/api/**", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Something went wrong" }),
        }),
      ),
  },
];

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.log(`FAIL ${label}\n     ${detail || "expected a load-failure block"}`);
  }
}

class Inconclusive extends Error {}

/** Port 0: the OS picks, and `ready` resolves to the one it picked. */
function serve(dir) {
  const server = serveBuild(dir, 0);
  return server.ready.then((port) => ({ server, port }));
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, "index.html"))) {
    throw new Inconclusive(`no build at ${ROOT}. Run: pnpm --filter @workspace/app run build`);
  }

  const { chromium } = await import("playwright-core");
  const { server, port } = await serve(ROOT);
  const base = `http://127.0.0.1:${port}`;
  let browser;

  try {
    browser = await chromium.launch(launchOptions());

    /*
     * A real session first, then the network taken away.
     *
     * The route guards read the token's own claims rather than asking the
     * server, so a made-up token redirects to sign-in and every page below
     * would "pass" by never rendering. installSession issues one the guards
     * accept.
     */
    for (const failure of FAILURES) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      /*
       * A real session first, then the failure. The route guards read the
       * token's own claims rather than asking the server, so a made-up token
       * redirects to sign-in and every page below would "pass" by never
       * rendering. installSession issues one the guards accept.
       */
      await installSession(context, { role: "student" });
      // Installed after the fixtures so this wins.
      await failure.install(context);
      console.log(`\n${failure.describe}:\n`);

      for (const pathname of PAGES) {
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 160)));
        await page.goto(`${base}${pathname}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4000);

        const failureBlocks = await page.locator('[data-testid="load-failure"]').count();
        const text = await page.evaluate(() => {
          const main = document.querySelector("main") ?? document.body;
          return main.innerText.replace(/\s+/g, " ").slice(0, 220);
        });

        if (failure.expect === "waiting") {
          const sentence = EMPTY_SENTENCE[pathname];
          check(
            `${pathname} [waiting] does not decide the reader has nothing`,
            !sentence || !text.includes(sentence),
            `showed ${JSON.stringify(sentence)} while still asking`,
          );
          check(
            `${pathname} [waiting] has not given up either`,
            failureBlocks === 0,
            `showed a load-failure block before anything failed`,
          );
        } else {
          check(
            `${pathname} [${failure.name}] says it could not load`,
            failureBlocks > 0,
            `no load-failure block; the page showed: ${text}`,
          );
        }
        check(
          `${pathname} [${failure.name}] does not throw`,
          pageErrors.length === 0,
          pageErrors[0] ?? "",
        );
        await page.close();
      }

      await context.close();
    }
  } finally {
    await browser?.close().catch(() => {});
    server.close();
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (error instanceof Inconclusive) {
      console.log(`\nInconclusive: ${error.message}`);
      process.exit(EXIT_INCONCLUSIVE);
    }
    console.error(error);
    process.exit(1);
  });
