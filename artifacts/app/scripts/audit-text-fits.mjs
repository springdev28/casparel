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
 * And a third, which is what a too-narrow box looks like when the page has
 * already been protected against overflowing: a single word broken across two
 * lines. index.css sets overflow-wrap: anywhere below 768px, so on a phone
 * nothing overflows -- it gets chopped instead, and the first two checks see a
 * page where everything fits. "Objetivo:" on the dashboard was squeezed by a
 * flex row until it rendered as "Objetivo" with the colon alone underneath,
 * and both of those checks passed on it.
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
import { inParallel } from "./in-parallel.mjs";
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
    "/canvases,/classes/31,/classes/31?tab=assignments,/classes/31?tab=designer,/classes/31?tab=activities,/classes/31?tab=resources,/lists/44,/profile/2,/guide,/tutorial,/resources,/resources/101"
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
   * Where an element sits, in words that do not change with the language.
   *
   * The report groups a finding by a key so that the same box measured in six
   * languages is one line, and so that a box already too small for its own
   * English is reported separately -- a layout bug rather than a translation
   * one. That key used to be built from the text, which is the one thing that
   * *does* change with the language, so nothing ever grouped: the English and
   * the Spanish were two different findings about the same element, and the
   * English control never fired. The search field on /resources was reported
   * as breaking in five translations when it does not fit its own English
   * either.
   */
  const addressOf = (element) => {
    const steps = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const siblings = [...(node.parentElement?.children ?? [])];
      steps.unshift(node.tagName.toLowerCase() + ':' + siblings.indexOf(node));
      if (steps.length >= 6) break;
    }
    return steps.join('>');
  };

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
      address: addressOf(element),
      offScreen: true,
    });
  }
  /*
   * A single word broken across two lines.
   *
   * Not overflow and not off-screen -- the text is entirely visible, and the
   * box it sits in is exactly as wide as it was told to be. What happened is
   * that a flex item shrank below its content: every child of a flex row is a
   * flex item, and a flex item's default is to shrink. "Goal:" survives that
   * in English. "Objetivo:" at 375px, next to a long goal title, was squeezed
   * until the browser broke it, leaving the colon alone on the second line.
   *
   * A word has no spaces in it, so a run of text with no whitespace occupying
   * more than one line box means the break happened *inside* a word. For a
   * short label that is never the intent.
   *
   * Three things are skipped, all of them somebody having already decided:
   * word-break: break-all and overflow-wrap: break-word, which are the
   * break-all and break-words utilities written on the element itself;
   * hyphens: auto, which breaks with a hyphen at a syllable and is correct
   * typography rather than a mistake; and user content, where an unbroken
   * 40-character title is the reader's own doing.
   *
   * What is deliberately *not* skipped is overflow-wrap: anywhere, even
   * though it is the mechanism doing the breaking. index.css sets it on a
   * whole region below 768px as an anti-overflow safety valve, and it
   * inherits -- so on a phone it quietly converts every too-narrow box on the
   * page from an overflow this audit would catch into a chopped word it would
   * not. That is the distinction between the two values here: break-word is
   * written on the element that wants it, anywhere rains down from a media
   * query on everything below it. Excluding both, as the first draft did,
   * meant this check passed on the exact bug it was written for.
   */
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const word = node.data.trim();
    if (!word || /\\s/.test(word)) continue;
    // A long token -- a URL, a hash, a file name -- has to break somewhere.
    if (word.length > 24) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest('[translate="no"], [data-user-content], code, pre')) continue;
    if (String(parent.className).includes(${JSON.stringify(DELIBERATELY_CLIPPED)})) continue;
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.wordBreak === 'break-all') continue;
    if (style.overflowWrap === 'break-word') continue;
    if (style.hyphens === 'auto') continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = new Set(
      [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => Math.round(rect.top)),
    );
    if (lines.size < 2) continue;
    clipped.push({
      text: word,
      over: lines.size,
      where: String(parent.className).slice(0, 60),
      tag: parent.tagName.toLowerCase(),
      address: addressOf(node.parentElement),
      brokenWord: true,
    });
  }

  /*
   * A placeholder wider than the field it sits in.
   *
   * A placeholder is an attribute, not a text node, so every check above walks
   * straight past it -- and an input never overflows, it just stops drawing.
   * "Add a path step…" fits at 375px; "Pfadschritt hinzufügen" became
   * "Pfadschritt hinzuf", which reads as a different instruction rather than a
   * truncated one, and there is no ellipsis to say so.
   *
   * Measured by rendering the text: the same font on a canvas, against the
   * field's content box. Off by a pixel or two on letter-spacing, so the
   * threshold is generous -- what matters is a word going missing, not a
   * descender touching the edge.
   */
  const ruler = document.createElement('canvas').getContext('2d');
  for (const field of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    const placeholder = (field.getAttribute('placeholder') || '').trim();
    if (!placeholder) continue;
    const rect = field.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const style = getComputedStyle(field);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // A textarea wraps; only a single-line field truncates.
    if (field.tagName === 'TEXTAREA') continue;
    ruler.font = style.font ||
      (style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily);
    const room =
      rect.width -
      parseFloat(style.paddingLeft || '0') -
      parseFloat(style.paddingRight || '0') -
      parseFloat(style.borderLeftWidth || '0') -
      parseFloat(style.borderRightWidth || '0');
    const needed = ruler.measureText(placeholder).width;
    const over = Math.round(needed - room);
    if (over <= 4) continue;
    clipped.push({
      text: placeholder,
      over,
      where: String(field.className).slice(0, 60),
      tag: field.tagName.toLowerCase(),
      address: addressOf(field),
      placeholder: true,
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
      address: addressOf(element),
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

/*
 * One flat list of renders, run a few at a time.
 *
 * The nesting below expressed "every page in every language at every width",
 * which is a description of the work rather than an order it has to happen in:
 * each render is its own browser context against a static file server. The
 * findings are folded into `clippedIn` afterwards, in the list's order, so the
 * report reads the same however the renders finished.
 */
const TASKS = [];
for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    for (const pagePath of PAGES) {
      TASKS.push({ language, viewport, pagePath });
    }
  }
}

const measured = await inParallel(TASKS, async ({ language, viewport, pagePath }) => {
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
    const entries = await page.evaluate(MEASURE);
    return { language, viewport, pagePath, entries };
  } catch (error) {
    console.error(
      `  !  ${pagePath} [${language} @${viewport.name}] failed: ${error.message}`,
    );
    return null;
  } finally {
    await context.close();
  }
});

for (const result of measured) {
  if (!result) continue;
  const { language, viewport, pagePath, entries } = result;
  rendered += 1;
  for (const entry of entries) {
    const kind = entry.offScreen
      ? "past the right edge: "
      : entry.brokenWord
        ? "one word broken across lines: "
        : entry.placeholder
          ? "placeholder wider than its field: "
          : "";
    // Keyed by where the element is, not by what it says: see addressOf.
    const key =
      `${pagePath} @${viewport.name} ${kind}${entry.address} ` +
      `[${entry.tag}.${entry.where}]`;
    const seen = clippedIn.get(key) ?? { by: new Map(), says: new Map() };
    seen.by.set(language, entry.over);
    seen.says.set(language, entry.text);
    clippedIn.set(key, seen);
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
for (const [key, seen] of clippedIn) {
  const languages = [...seen.by.keys()];
  const worst = Math.max(...seen.by.values());
  const measure = key.includes("one word broken across lines:")
    ? `broken in ${languages.join(", ")}, across up to ${worst} lines`
    : `clipped in ${languages.join(", ")}, by up to ${worst}px`;
  // The worst language's own words, so the report names what a reader sees.
  const worstLanguage = languages.find((l) => seen.by.get(l) === worst) ?? languages[0];
  const line =
    `${key}\n      ${JSON.stringify(seen.says.get(worstLanguage))} (${worstLanguage})` +
    `\n      ${measure}`;
  if (seen.by.has("en")) englishToo.push(line);
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
