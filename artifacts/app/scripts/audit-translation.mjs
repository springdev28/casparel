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
import { launchOptions } from "./chromium.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../dist/public");
const PORT = Number(process.env.AUDIT_TRANSLATION_PORT ?? 4326);
const LANGS = (process.env.AUDIT_LANGS ?? "tr,es,fr,de,pt").split(",").filter(Boolean);
/** How many untranslated strings may remain before this fails. */
const BUDGET = Number(process.env.AUDIT_TRANSLATION_MAX ?? 0);

const PAGES = (
  process.env.AUDIT_PAGES ??
  "/,/resources,/support,/download,/plans,/auth/login,/auth/register,/terms,/privacy"
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

/**
 * The keys a dictionary deliberately leaves as they are.
 *
 * This audit decides a string is untranslated by rendering the page twice and
 * seeing which strings survive unchanged. That is the right test for a missing
 * entry, and it cannot tell one from an entry that is *meant* to be identical:
 * "Forum" is "Forum" in German, "Canvas" is "Canvas" in five languages, and
 * every one of them was reported as a gap. Real gaps then sit in a list mostly
 * made of non-gaps, which is how a report stops being read.
 *
 * So the dictionaries are consulted. They are TypeScript modules and this is a
 * plain script, so the pairs are read as text -- they are flat string literals,
 * one per line, which is exactly what that can do reliably.
 */
function deliberatelyIdentical(language) {
  const file = path.resolve(HERE, `../src/lib/ui-translations/${language}.ts`);
  if (!fs.existsSync(file)) return new Set();
  const identical = new Set();
  for (const [, key, value] of fs
    .readFileSync(file, "utf8")
    .matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)) {
    if (key === value) identical.add(JSON.parse(`"${key}"`));
  }
  return identical;
}

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
  // noscript and template hold markup that is never painted for a reader with
  // JavaScript, and the bridge does not walk them either. Without this the SEO
  // fallback in index.html is collected as one enormous "untranslated string"
  // on every page, which no dictionary entry could ever match.
  const PROTECTED = '[translate="no"], [data-user-content], script, style, code, pre, textarea, input, [contenteditable="true"], noscript, template';
  // Words that are the same in every language we ship, or are product names.
  const ALLOWED = new Set([
    'Casparel','Google','Google Classroom','Quizlet','CSV','PNG','JPEG','WebP','PDF','URL','AI','OK',
    'Open Library','Wikibooks','Wikiversity','Wikipedia','RevenueCat','App Store','Google Play',
    // Platform names on the download page. "Mac, Windows and Linux" is a
    // phrase and IS translated; these two stand alone and must not be.
    'iPhone','Android',
    'MIT OpenCourseWare','MIT','OpenStax','Khan Academy',
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
    // "Open Library · Wikibooks" is two product names and a separator; each
    // half is allowed, so the join is too.
    if (text.includes(' · ') && text.split(' · ').every((part) => ALLOWED.has(part.trim()))) continue;
    if (ALLOWED.has(text.replace(/^[\\s,;:.·—–-]+/, '').trim())) continue;
    // Not prose: numbers, dates, times, money, counts, punctuation, initials.
    if (!/[A-Za-z]/.test(text)) continue;
    if (/^[\\d\\s.,:/%+·—–-]*$/.test(text)) continue;
    if (/^[A-Z]{1,4}$/.test(text)) continue;
    // A price is a number with a currency on it, whatever the letters: US$0,
    // US$5.99/mo. The amount is set by the store, not by a dictionary.
    if (/^[A-Z]{0,3}[$€£₺]\\s?[\\d.,]+(\\s?\\/\\s?\\w{1,3})?$/.test(text)) continue;
    // "© 2026 Casparel" is a notice made of a symbol, a year and a product
    // name, none of which any language changes.
    if (/^©\\s?\\d{4}\\s+Casparel$/.test(text)) continue;
    // An address, a hostname, or a date. None of them is wording.
    if (/^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(text)) continue;
    if (/^(?:[a-z0-9-]+\\.)+[a-z]{2,}$/i.test(text)) continue;
    if (/^\\d{1,2} [A-Z][a-z]+ \\d{4}$/.test(text)) continue;
    // Must contain an English-alphabet word of 2+ letters to be worth reporting.
    if (!/[A-Za-z]{2,}/.test(text)) continue;
    seen.add(text);
  }
  return [...seen];
})()`;

/*
 * The shared launcher, not a path spelled out here.
 *
 * This named /opt/pw-browsers/chromium, which is right in the container this
 * was written in and wrong on a CI runner, where `playwright install` puts the
 * browser in its own cache and the correct answer is to pass no path at all.
 * launchOptions() checks what exists and returns nothing when Playwright can
 * find its own browser, which is what every other audit here uses.
 */
const browser = await chromium.launch(launchOptions());

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
  // The language goes to the fixture too: the account preference wins over
  // the device choice, so a session that says "en" un-translates the render.
  // Signed-out renders get the API answered but no session, so a public page
  // that loads data renders itself rather than its error boundary.
  // As a student, not the admin this fixture defaults to: the panels a
  // student or teacher opens are the ones nearly every reader sees, and an
  // admin session renders different ones in their place.
  await installSession(context, { language, role: "student", signedOut: !signedIn });
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
  const identical = deliberatelyIdentical(language);
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
        if (stillEnglish.has(text) && !identical.has(text)) {
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
  const limit = process.env.AUDIT_TRANSLATION_LIST ? sorted.length : 40;
  for (const [text, where] of sorted.slice(0, limit)) {
    const label = text.length > 70 ? `${text.slice(0, 67)}…` : text;
    console.log(`  ${JSON.stringify(label)}  — ${[...where].slice(0, 3).join(", ")}`);
  }
  if (sorted.length > limit) console.log(`  …and ${sorted.length - limit} more`);
}

if (process.env.AUDIT_TRANSLATION_JSON) {
  // The untruncated strings, for whoever is going to write the entries.
  fs.writeFileSync(
    process.env.AUDIT_TRANSLATION_JSON,
    JSON.stringify(
      Object.fromEntries(
        [...report].map(([language, gaps]) => [
          language,
          [...gaps.keys()],
        ]),
      ),
      null,
      1,
    ),
  );
}

console.log(`\n${checked} page render(s) checked across ${LANGS.length} language(s).`);

/*
 * A run that rendered nothing proves nothing.
 *
 * Every page failing counts zero gaps, and zero is under any budget, so this
 * printed "Every visible string is translated" and exited 0 after a broken
 * regex made all 14 renders throw. A green audit that never looked at the
 * product is worse than a red one.
 */
if (checked === 0) {
  console.error("No page rendered. This run checked nothing.");
  process.exit(2);
}
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
