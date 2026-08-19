#!/usr/bin/env node
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
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchOptions } from "./chromium.mjs";
import { installSession } from "./audit-fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/public");
const EXIT_INCONCLUSIVE = 75;

/**
 * Pages whose whole content is the reader's own data.
 *
 * A page that mostly holds controls -- /settings, /catalog search -- has
 * nothing to be wrong about when a request fails, so it is not listed. These
 * five each make a statement about what the reader has.
 */
const PAGES = ["/dashboard", "/schedule", "/classes", "/goals", "/profile"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

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

function serve(dir) {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.join(dir, requested);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, "index.html");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, "index.html"))) {
    throw new Inconclusive(`no build at ${ROOT}. Run: pnpm --filter @workspace/app run build`);
  }

  const { chromium } = await import("playwright-core");
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;

  try {
    browser = await chromium.launch(launchOptions());
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    /*
     * A real session first, then the network taken away.
     *
     * The route guards read the token's own claims rather than asking the
     * server, so a made-up token redirects to sign-in and every page below
     * would "pass" by never rendering. installSession issues one the guards
     * accept.
     */
    await installSession(context, { role: "student" });
    // Installed after the fixtures so this wins: every API call now fails the
    // way a dropped connection fails, with no reply at all.
    await context.route("**/api/**", (route) => route.abort("connectionfailed"));

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

      check(
        `${pathname} says it could not load`,
        failureBlocks > 0,
        `no load-failure block; the page showed: ${text}`,
      );
      check(`${pathname} does not throw`, pageErrors.length === 0, pageErrors[0] ?? "");
      await page.close();
    }

    await context.close();
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
