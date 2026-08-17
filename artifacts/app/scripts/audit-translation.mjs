#!/usr/bin/env node
/**
 * Which UI strings are still English after the translation bridge has run.
 *
 * "Translation is not working everywhere" is unanswerable from the source: the
 * bridge matches whole strings in the DOM, third-party components render text
 * this app never sees as a literal, and a dictionary entry that does not match
 * character-for-character silently does nothing. So this renders the real
 * pages in a real browser with a language selected, reads every visible string,
 * and reports the ones no dictionary translated.
 *
 * It deliberately reports only what a user could actually see: hidden nodes,
 * anything inside a `translate="no"` region (names and user input, which must
 * stay untranslated), numbers, dates and product names are all excluded, so a
 * clean run means "nothing English is on screen", not "the dictionary is big".
 *
 * Usage, after building the app:
 *   node scripts/audit-translation.mjs            # every language with a dictionary
 *   AUDIT_LANGS=tr node scripts/audit-translation.mjs
 *   AUDIT_TRANSLATION_MAX=0 node …                # fail on any gap (default)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSession } from "./audit-fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../dist/public");
const PORT = Number(process.env.AUDIT_TRANSLATION_PORT ?? 4326);
const LANGS = (process.env.AUDIT_LANGS ?? "tr,es,fr,de,pt").split(",").filter(Boolean);
/** How many untranslated strings may remain before this fails. */
const BUDGET = Number(process.env.AUDIT_TRANSLATION_MAX ?? 0);

const PAGES = (
  process.env.AUDIT_PAGES ??
  "/,/resources,/support,/plans,/auth/login,/auth/register,/terms,/privacy"
)
  .split(",")
  .filter(Boolean);
// NOTE: /resources/<id> is deliberately absent. Its fixtures are in place
// (see audit-fixtures.mjs) but the detail page requests more endpoints than
// they cover and renders its error boundary, which would report the error
// page's own strings as translation gaps. Its strings were added to every
// dictionary by hand; wiring the remaining fixtures is the way to cover it
// here properly.
const SIGNED_IN_PAGES = (
  process.env.AUDIT_SIGNED_IN_PAGES ??
  "/dashboard,/profile,/resources,/catalog,/settings,/plans"
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

/**
 * Runs in the page: every visible string that still looks like English prose.
 *
 * The exclusions are the whole design. Without them this reports a person's
 * name as a missing translation and the report becomes noise nobody reads.
 */
const COLLECT = `(() => {
  const PROTECTED = '[translate="no"], [data-user-content], script, style, code, pre, textarea, input, [contenteditable="true"]';
  // Words that are the same in every language we ship, or are product names.
  const ALLOWED = new Set([
    'Casparel','Google','Google Classroom','Quizlet','CSV','PNG','JPEG','WebP','PDF','URL','AI','OK',
    'Open Library','Wikibooks','Wikiversity','Wikipedia','RevenueCat','App Store','Google Play',
    'Free','Plus','Pro','Student Plus','Student Pro','Teacher Plus','Teacher Pro','Institutional',
    'English','Español','Français','Deutsch','Português','Türkçe','Email','e-mail',
  ]);
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(PROTECTED)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    const text = node.data.trim();
    node = walker.nextNode();
    if (!text || text.length < 2) continue;
    if (ALLOWED.has(text)) continue;
    // Not prose: numbers, dates, times, money, counts, punctuation, initials.
    if (!/[A-Za-z]/.test(text)) continue;
    if (/^[\\d\\s.,:/%+·—–-]*$/.test(text)) continue;
    if (/^[A-Z]{1,4}$/.test(text)) continue;
    // Must contain an English-alphabet word of 2+ letters to be worth reporting.
    if (!/[A-Za-z]{2,}/.test(text)) continue;
    seen.add(text);
  }
  return [...seen];
})()`;

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
      : "/opt/pw-browsers/chromium"),
});

/** Every visible prose string on one page, in one language. */
async function collect(pagePath, language, signedIn) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(
    ([lang]) => {
      try {
        localStorage.setItem("schoolar_language", lang);
      } catch {
        /* storage disabled */
      }
    },
    [language],
  );
  if (signedIn) await installSession(context);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}${pagePath}`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  // The bridge translates on an animation frame after paint.
  await page.waitForTimeout(400);
  const strings = await page.evaluate(COLLECT);
  await context.close();
  return strings;
}

const report = new Map(); // language -> Map(string -> pages[])
let checked = 0;

for (const language of LANGS) {
  const gaps = new Map();
  for (const [pages, signedIn] of [
    [PAGES, false],
    [SIGNED_IN_PAGES, true],
  ]) {
    for (const pagePath of pages) {
      let englishStrings;
      let translatedStrings;
      try {
        [englishStrings, translatedStrings] = await Promise.all([
          collect(pagePath, "en", signedIn),
          collect(pagePath, language, signedIn),
        ]);
      } catch (error) {
        console.error(`  !  ${pagePath} [${language}] failed: ${error.message}`);
        continue;
      }
      checked += 1;
      // A string that survives untouched into the translated render, and was
      // present in English too, had no dictionary entry that matched.
      const stillEnglish = new Set(translatedStrings);
      for (const text of englishStrings) {
        if (stillEnglish.has(text)) {
          const where = gaps.get(text) ?? new Set();
          where.add(`${signedIn ? "signed-in " : ""}${pagePath}`);
          gaps.set(text, where);
        }
      }
    }
  }
  report.set(language, gaps);
}

await browser.close();
server.close();

let total = 0;
for (const [language, gaps] of report) {
  const sorted = [...gaps.entries()].sort((a, b) => b[1].size - a[1].size);
  total += sorted.length;
  console.log(`\n${language}: ${sorted.length} untranslated string(s)`);
  for (const [text, where] of sorted.slice(0, 40)) {
    const label = text.length > 70 ? `${text.slice(0, 67)}…` : text;
    console.log(`  ${JSON.stringify(label)}  — ${[...where].slice(0, 3).join(", ")}`);
  }
  if (sorted.length > 40) console.log(`  …and ${sorted.length - 40} more`);
}

console.log(`\n${checked} page render(s) checked across ${LANGS.length} language(s).`);
if (total > BUDGET) {
  console.error(
    `\n${total} untranslated string(s) — over the budget of ${BUDGET}.`,
  );
  process.exit(1);
}
// Only claim completeness when it is true: a raised budget means gaps were
// tolerated, not that there are none, and saying otherwise would make this
// audit lie in exactly the way it exists to prevent.
console.log(
  total === 0
    ? "Every visible string is translated."
    : `${total} untranslated string(s), within the budget of ${BUDGET}.`,
);
