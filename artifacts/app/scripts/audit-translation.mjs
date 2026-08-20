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
  "/,/resources,/support,/download,/code-signing,/plans,/auth/login,/auth/register,/terms,/privacy"
)
  .split(",")
  .filter(Boolean);
/*
 * Every signed-in route the page audit renders, not the six this list started
 * with. The two audits had drifted apart: the render audit grew to sixteen
 * routes and this one stayed at six, so ten pages -- schedule, classes, goals,
 * forum, messages, activities, lists, people, canvas, admin -- were rendered
 * every build and never once read in another language. Measured when they were
 * finally added: 36 strings a Spanish reader saw in English, on pages that
 * looked fully translated because the pages that were checked were.
 */
const SIGNED_IN_PAGES = (
  process.env.AUDIT_SIGNED_IN_PAGES ??
  "/dashboard,/profile,/resources,/catalog,/settings,/plans," +
    "/schedule,/classes,/goals,/forum,/messages,/activities,/lists,/people," +
    "/canvases,/classes/31,/guide,/tutorial,/admin," +
    // The resource detail page, which was left out for a long time because it
    // rendered its error boundary: one endpoint had no fixture, the default
    // empty array reached `workflow?.steps[key]`, and the page crashed. Both
    // halves are fixed, so the page this product's headline feature lives on
    // is finally read in every language.
    "/resources/101"
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
    // Operating systems and the signing vendor, on the code signing page.
    'Windows','macOS','Linux','SignPath Foundation','Apple Developer ID',
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

  /*
   * The four attributes the bridge also rewrites.
   *
   * It translates aria-label, placeholder, title and alt as readily as it
   * translates text, and this walked text nodes only -- so a placeholder with
   * no dictionary entry was invisible here and English on screen. Found by
   * looking at a Spanish resource page whose review box still said "Share your
   * thoughts…" under a heading that said "Comentario (opcional)".
   *
   * Two of the four are read aloud rather than seen, which makes them easier
   * to leave behind and no less worth translating: a screen-reader user gets
   * the whole interface through aria-label.
   */
  for (const element of document.querySelectorAll('[aria-label], [placeholder], [title], [alt]')) {
    if (element.closest('[translate="no"], [data-user-content]')) continue;
    // A control the reader cannot reach is not a string the reader sees.
    if (!element.getClientRects().length) continue;
    for (const attribute of ['aria-label', 'placeholder', 'title', 'alt']) {
      const value = (element.getAttribute(attribute) || '').trim();
      if (!value || value.length < 2) continue;
      if (ALLOWED.has(value)) continue;
      if (!/[A-Za-z]{2,}/.test(value)) continue;
      seen.add(value);
    }
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

/**
 * Desktop and a phone.
 *
 * This rendered only at 1280px, which meant every `md:hidden` region was
 * invisible to it -- and those regions are not a smaller version of the
 * desktop, they are different markup with different strings. The schedule's
 * whole phone view of the week is one of them; so is the search field's short
 * placeholder, which only exists below 768px. A string that renders only on a
 * phone was never once read in another language.
 */
const VIEWPORTS = [
  { width: 1280, height: 900, name: "desktop" },
  { width: 375, height: 812, name: "phone" },
];

/** How many pages this run actually opened in a browser. */
let rendered = 0;

/** Every visible prose string on one page, in one language, at one width. */
async function collect(pagePath, language, signedIn, viewport) {
  rendered += 1;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
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

/**
 * The English render of a page, kept.
 *
 * Every language is compared against English, and English does not change
 * between them -- but this rendered it again for each one, so a five-language
 * run opened the same page in English five times. Half of every run was
 * re-reading the control. Keyed by page, width and session, which is
 * everything that changes what English renders.
 */
const englishCache = new Map();
async function collectEnglish(pagePath, signedIn, viewport) {
  const key = `${pagePath}|${signedIn}|${viewport.name}`;
  if (!englishCache.has(key)) {
    englishCache.set(key, await collect(pagePath, "en", signedIn, viewport));
  }
  return englishCache.get(key);
}

for (const language of LANGS) {
  const gaps = new Map();
  const identical = deliberatelyIdentical(language);
  for (const [pages, signedIn] of [
    [PAGES, false],
    [SIGNED_IN_PAGES, true],
  ]) {
    for (const pagePath of pages) {
      for (const viewport of VIEWPORTS) {
        let englishStrings;
        let translatedStrings;
        try {
          [englishStrings, translatedStrings] = await Promise.all([
            collectEnglish(pagePath, signedIn, viewport),
            collect(pagePath, language, signedIn, viewport),
          ]);
        } catch (error) {
          console.error(
            `  !  ${pagePath} [${language} @${viewport.name}] failed: ${error.message}`,
          );
          continue;
        }
        checked += 1;
        // A string that survives untouched into the translated render, and was
        // present in English too, had no dictionary entry that matched.
        const stillEnglish = new Set(translatedStrings);
        for (const text of englishStrings) {
          if (stillEnglish.has(text) && !identical.has(text)) {
            const where = gaps.get(text) ?? new Set();
            where.add(
              `${signedIn ? "signed-in " : ""}${pagePath} @${viewport.name}`,
            );
            gaps.set(text, where);
          }
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

console.log(
  `\n${checked} page comparison(s) across ${LANGS.length} language(s), from ` +
    `${rendered} browser render(s): English is opened once per page, width and ` +
    `session rather than once per language.`,
);

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
