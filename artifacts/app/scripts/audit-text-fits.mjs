#!/usr/bin/env node
/**
 * Text that fits its box in English, and does not in the other five.
 *
 * A translated word is rarely the same length as the English one. "Off" is
 * "Desactivado"; "I can" is "Yapabiliyorum". Anything laid out to the width of
 * the English -- a fixed-width select, a three-column grid of buttons, a badge
 * -- clips the moment it is translated, and clips only for the readers who
 * cannot fall back to the English.
 *
 * Nothing else looks for this. The translation audit checks that a string was
 * translated, not that the translation is readable; every render audit passes,
 * because the page renders perfectly well with a word cut in half. It is
 * visible only by measuring, or by looking, and looking is how this one was
 * found: a Spanish screenshot with "Desactivadc" in the toolbar.
 *
 * What counts as clipped: the element's own content is wider than its box, and
 * nothing is handling the overflow -- no ellipsis, no scrollbar. An ellipsis is
 * a decision to truncate and this leaves it alone; the failure here is the
 * silent kind, where the last letter is simply gone.
 *
 *   node scripts/audit-text-fits.mjs
 *   AUDIT_FIT_LANGS=de node scripts/audit-text-fits.mjs
 *
 * Exit codes: 0 everything fits, 1 something is clipped, 2 the run could not
 * look (no build, no browser, nothing rendered).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSession } from "./audit-fixtures.mjs";
import { launchOptions } from "./chromium.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../dist/public");
const PORT = Number(process.env.AUDIT_FIT_PORT ?? 4329);

/**
 * Every language with a dictionary, and English as the control.
 *
 * English is measured too, and deliberately: a box already too small for its
 * own English is not a translation problem, and reporting it here would send
 * the next person looking in the dictionaries.
 */
const LANGUAGES = (process.env.AUDIT_FIT_LANGS ?? "en,es,fr,de,pt,tr").split(",");

const PAGES = (
  process.env.AUDIT_FIT_PAGES ??
  "/dashboard,/profile,/settings,/plans,/schedule,/classes,/goals,/lists,/resources"
)
  .split(",")
  .filter(Boolean);

/**
 * Widths this audit deliberately ignores.
 *
 * `sr-only` is the pattern for text that exists for a screen reader and is
 * clipped to a 1px box on purpose -- it is *supposed* to overflow, in every
 * language, and it is the single biggest source of noise here.
 */
const DELIBERATELY_CLIPPED = "sr-only";

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

const MEASURE = `(() => {
  const clipped = [];
  for (const element of document.querySelectorAll('*')) {
    // Leaf nodes only: a container's overflow is its children's problem, and
    // reporting both says the same thing twice.
    if (element.children.length) continue;
    const text = (element.textContent || '').trim();
    if (text.length < 3) continue;
    if (String(element.className).includes(${JSON.stringify(DELIBERATELY_CLIPPED)})) continue;

    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (!element.getClientRects().length) continue;
    // Somebody is handling it: truncation with an ellipsis is a decision, and
    // a scrollable box is reachable.
    if (style.textOverflow === 'ellipsis') continue;
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;

    const over = element.scrollWidth - element.clientWidth;
    // A pixel or two is subpixel rounding rather than a lost letter.
    if (over <= 2) continue;

    clipped.push({
      text: text.slice(0, 60),
      over,
      where: String(element.className).slice(0, 60),
      tag: element.tagName.toLowerCase(),
    });
  }
  return clipped;
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

/** text -> the languages it is clipped in, so English can be told apart. */
const clippedIn = new Map();
let rendered = 0;

for (const language of LANGUAGES) {
  for (const pagePath of PAGES) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await context.addInitScript((lang) => {
      try {
        localStorage.setItem("schoolar_language", lang);
      } catch {
        /* storage disabled */
      }
    }, language);
    await installSession(context, { language, role: "student" });
    const page = await context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${PORT}${pagePath}`, {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      // The bridge rewrites after paint, and a box measured before it has done
      // so is a box measured in English.
      await page.waitForTimeout(600);
      rendered += 1;
      for (const entry of await page.evaluate(MEASURE)) {
        const key = `${pagePath}  ${JSON.stringify(entry.text)}  [${entry.tag}.${entry.where}]`;
        const seen = clippedIn.get(key) ?? new Map();
        seen.set(language, entry.over);
        clippedIn.set(key, seen);
      }
    } catch (error) {
      console.error(`  !  ${pagePath} [${language}] failed: ${error.message}`);
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

/*
 * Only what English fits and a translation does not.
 *
 * A box too small for its own English is a layout bug rather than a
 * localisation one, and it would send whoever reads this report into the
 * dictionaries looking for something that is not there. Reported separately,
 * and not as a failure of this audit.
 */
const translationsOnly = [];
const englishToo = [];
for (const [key, byLanguage] of clippedIn) {
  const languages = [...byLanguage.keys()];
  const worst = Math.max(...byLanguage.values());
  const line = `${key}\n      clipped in ${languages.join(", ")}, by up to ${worst}px`;
  if (byLanguage.has("en")) englishToo.push(line);
  else translationsOnly.push(line);
}

if (englishToo.length) {
  console.log(`\n${englishToo.length} clipped in English too (layout, not translation):`);
  for (const line of englishToo) console.log(`  ${line}`);
}

if (translationsOnly.length) {
  console.error(`\n${translationsOnly.length} clipped only after translation:`);
  for (const line of translationsOnly) console.error(`  ${line}`);
  console.error(
    `\nThese fit the English and not the translation, so only the readers who ` +
      `cannot fall back to English see them. Widen the box, let the text wrap, ` +
      `or shorten the entry.`,
  );
  process.exit(1);
}

console.log(
  `\n${rendered} render(s) across ${LANGUAGES.length} languages: every visible ` +
    `string fits the box drawn for it.`,
);
