#!/usr/bin/env node
/**
 * Every control a reader can reach has a name, and every id is one thing.
 *
 * This is the half of the interface that does not appear in a screenshot. An
 * icon button with no label is a perfectly good button to look at and the word
 * "button" to everybody using a screen reader; it is also the easiest thing in
 * the world to add, because the icon reads as the label to whoever wrote it.
 *
 * Both stores' review guidelines ask for it, and Casparel is a school product,
 * which is a setting where assistive technology is the norm rather than the
 * exception.
 *
 * What it looks for:
 *
 *  - A focusable control with no accessible name from any source: aria-label,
 *    aria-labelledby, a title, its own text, an img alt inside it, an sr-only
 *    span, or a <label for>.
 *  - An <img> with no alt attribute at all. `alt=""` is a decision -- this is
 *    decorative, skip it -- and is left alone; a missing attribute means
 *    nobody decided, and a screen reader falls back to reading the filename.
 *  - An id used twice. `label[for]`, `aria-labelledby` and SVG `url(#…)` all
 *    resolve document-wide and first-match, so a duplicate silently points
 *    half the references at the wrong element.
 *
 * What it deliberately ignores: elements that are `aria-hidden` or
 * `tabindex="-1"`. Radix renders a hidden 1×1 native <select> beside each of
 * its own, for form compatibility, and reporting those buried eight real
 * pages' worth of output in false positives the first time this ran.
 *
 *   node scripts/audit-reachable.mjs
 *
 * Exit codes: 0 clean, 1 something is unreachable, 2 the run could not look.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSession } from "./audit-fixtures.mjs";
import { launchOptions } from "./chromium.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../dist/public");
const PORT = Number(process.env.AUDIT_REACH_PORT ?? 4330);

/** Signed out for the public pages, signed in for the rest. */
const PUBLIC_PAGES = (process.env.AUDIT_REACH_PUBLIC ?? "/,/resources,/plans,/support")
  .split(",")
  .filter(Boolean);
const SIGNED_IN_PAGES = (
  process.env.AUDIT_REACH_PAGES ??
  "/dashboard,/profile,/settings,/plans,/schedule,/classes,/goals,/forum," +
    "/messages,/activities,/lists,/people,/canvases,/resources,/resources/101,/admin"
)
  .split(",")
  .filter(Boolean);

const MIME = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const CHECK = `(() => {
  const problems = [];
  const CONTROLS =
    'button, a[href], [role="button"], [role="link"], [role="checkbox"], ' +
    '[role="switch"], [role="tab"], input:not([type="hidden"]), select, textarea, summary';

  const reachable = (element) => {
    if (!element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    // Hidden from assistive tech on purpose, or removed from the tab order.
    if (element.closest('[aria-hidden="true"]')) return false;
    if (element.getAttribute('tabindex') === '-1') return false;
    return true;
  };

  const describe = (element) =>
    element.tagName.toLowerCase() +
    (element.getAttribute('data-testid') ? '[' + element.getAttribute('data-testid') + ']' : '') +
    '.' + String(element.className).slice(0, 50);

  for (const element of document.querySelectorAll(CONTROLS)) {
    if (!reachable(element)) continue;
    const named =
      (element.getAttribute('aria-label') || '').trim() ||
      element.getAttribute('aria-labelledby') ||
      (element.getAttribute('title') || '').trim() ||
      (element.textContent || '').trim() ||
      [...element.querySelectorAll('img[alt]')].some((i) => i.getAttribute('alt').trim()) ||
      [...element.querySelectorAll('.sr-only')].some((n) => n.textContent.trim()) ||
      (element.id && document.querySelector('label[for="' + CSS.escape(element.id) + '"]')) ||
      element.closest('label');
    if (!named) problems.push('no accessible name: ' + describe(element));
  }

  for (const img of document.querySelectorAll('img:not([alt])')) {
    if (!reachable(img)) continue;
    problems.push('no alt attribute: img ' + (img.getAttribute('src') || '').slice(-45));
  }

  const counts = new Map();
  for (const element of document.querySelectorAll('[id]')) {
    counts.set(element.id, (counts.get(element.id) || 0) + 1);
  }
  for (const [id, n] of counts) {
    if (n > 1) problems.push('id used ' + n + ' times: #' + id);
  }

  return problems;
})()`;

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

const server = http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = path.join(ROOT, url);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOT, "index.html");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
    });
    res.end(fs.readFileSync(file));
  })
  .listen(PORT, "127.0.0.1");

const browser = await chromium.launch(launchOptions());
const failures = [];
let rendered = 0;

for (const [pages, signedOut] of [
  [PUBLIC_PAGES, true],
  [SIGNED_IN_PAGES, false],
]) {
  for (const pagePath of pages) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await installSession(context, {
      language: "en",
      // Admin for /admin, which renders a different surface entirely.
      ...(pagePath === "/admin"
        ? { role: "admin", activeRole: "admin", accountRole: "admin" }
        : { role: "student" }),
      signedOut,
    });
    const page = await context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${PORT}${pagePath}`, {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      await page.waitForTimeout(500);
      rendered += 1;
      const problems = await page.evaluate(CHECK);
      for (const problem of problems) {
        failures.push(`${signedOut ? "" : "signed-in "}${pagePath}: ${problem}`);
      }
      console.log(
        `  ${problems.length ? "!! " : "ok "} ${pagePath}${signedOut ? "" : " [signed in]"}`,
      );
    } catch (error) {
      console.error(`  !  ${pagePath} failed: ${error.message}`);
    }
    await context.close();
  }
}

await browser.close();
server.close();

if (rendered === 0) {
  console.error("No page rendered. This run checked nothing.");
  process.exit(2);
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `\n${rendered} page(s): every reachable control has a name, every image has ` +
    `an alt decision, and no id is used twice.`,
);
