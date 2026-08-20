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
 * And a second, related failure it did not see at first: an element that fits
 * its own box perfectly well and sticks out past the right edge of the screen.
 * On /resources at 375px the "Submit resource" button ran 9px past the edge in
 * Spanish and 32px in German. Text fitting its box and the box fitting the
 * screen are different questions, and only the second gets worse the longer
 * the translation is.
 *
 * A scrollable ancestor is not an excuse, which took a measurement to settle.
 * The first version of this skipped anything inside an overflow-x container,
 * on the theory that scrollable means reachable -- and that swallowed the very
 * case it was written for, because <main> carries overflow-x: auto as a
 * generic safety valve. The button was reachable by dragging the page
 * sideways. It was also off the edge of a phone screen until you did, and a
 * page that scrolls horizontally on a phone is the defect rather than the
 * remedy. So this reports them, and a genuine sideways region -- a carousel, a
 * wide table -- gets named in DELIBERATELY_SIDEWAYS when one appears.
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

/**
 * Desktop and a narrow phone.
 *
 * 375px is where a long translation runs out of room first, and it is also
 * the width most of this product's readers are on. The desktop width is kept
 * because a wide layout has its own fixed-width controls -- the toolbar select
 * that started this was clipped at 1280 and fine at 375, where it is hidden.
 */
const VIEWPORTS = [
  { width: 1280, height: 900, name: "desktop" },
  { width: 375, height: 812, name: "phone" },
];

const PAGES = (
  process.env.AUDIT_FIT_PAGES ??
  "/dashboard,/profile,/settings,/plans,/schedule,/classes,/goals,/lists," +
    "/resources,/resources/101"
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

/**
 * Regions that are meant to scroll sideways, and so may exceed the screen.
 *
 * Empty today. Named by selector rather than inferred from overflow-x,
 * because "has an overflow-x" is what a container gets as a precaution and
 * "is a carousel" is a decision somebody made.
 */
const DELIBERATELY_SIDEWAYS = process.env.AUDIT_FIT_SIDEWAYS ?? "[data-sideways]";

const MEASURE = `(() => {
  const clipped = [];
  const viewport = document.documentElement.clientWidth;
  const SIDEWAYS_ON_PURPOSE = ${JSON.stringify(DELIBERATELY_SIDEWAYS)};

  /*
   * Anything reaching past the right edge of the screen.
   *
   * Position-fixed elements are skipped -- a drawer parked off-screen is how
   * a drawer waits -- and so is anything inside a container that scrolls
   * horizontally on purpose, which is a decision rather than an accident.
   */
  for (const element of document.querySelectorAll('body *')) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.position === 'fixed') continue;
    const over = Math.round(rect.right - viewport);
    if (over <= 1) continue;
    if (element.closest(SIDEWAYS_ON_PURPOSE)) continue;
    clipped.push({
      text: (element.textContent || '').trim().slice(0, 60),
      over,
      where: String(element.className).slice(0, 60),
      tag: element.tagName.toLowerCase(),
      offScreen: true,
    });
  }
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
  for (const viewport of VIEWPORTS) {
  for (const pagePath of PAGES) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
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
        const key =
          `${pagePath} @${viewport.name}  ` +
          `${entry.offScreen ? "past the right edge: " : ""}` +
          `${JSON.stringify(entry.text)}  [${entry.tag}.${entry.where}]`;
        const seen = clippedIn.get(key) ?? new Map();
        seen.set(language, entry.over);
        clippedIn.set(key, seen);
      }
    } catch (error) {
      console.error(
        `  !  ${pagePath} [${language} @${viewport.name}] failed: ${error.message}`,
      );
    }
    await context.close();
  }
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
  `\n${rendered} render(s) across ${LANGUAGES.length} languages and ` +
    `${VIEWPORTS.length} widths: every visible string fits the box drawn for it.`,
);
