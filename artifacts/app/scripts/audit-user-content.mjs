#!/usr/bin/env node
/**
 * The translation bridge must not rewrite what the user wrote.
 *
 * The bridge is a MutationObserver that rewrites exact English strings
 * anywhere in the signed-in app. It skips anything inside `translate="no"` or
 * `data-user-content` -- and everything else it will happily translate,
 * including text that came out of the database.
 *
 * That is not theoretical. Rendered against a Spanish account, a flashcard
 * deck titled "Answer" whose cards read "Share" and "Close" came back as
 * "Respuesta", "Compartir" and "Cerrar": the study tool translated the
 * vocabulary the student was trying to learn. A Spanish speaker building an
 * English deck is not an edge case -- it is the single most likely person to
 * build one. The dictionary holds 425 one- and two-word entries, so the
 * collision surface is a class name, a goal step, a list title or a card away.
 *
 * Checking it by translation is the wrong instrument: "Compartir" on screen
 * might be a genuine Share button, so a real gap and a real button look the
 * same. So this asks the question directly instead. Every user-content field
 * in the fixtures is set to a marker no dictionary contains, the page is
 * rendered, and each marker on screen is asked one thing: are you inside a
 * region the bridge is required to leave alone? A marker outside one is text
 * the bridge is free to rewrite the day it happens to match an entry.
 *
 * Attributes count. The bridge translates `title`, `aria-label`, `placeholder`
 * and `alt` too, and a class named after a dictionary entry would have had its
 * tooltip rewritten while its heading stayed put.
 *
 * What is *not* reported is a node holding user text and product wording
 * together -- "Shared by <name>, used 4 times" composed in JavaScript rather
 * than in JSX. The bridge can only act on a whole trimmed node, so such a node
 * either misses the dictionary entirely or matches one of the shape rules,
 * which capture the varying part and re-emit it verbatim. The user's text
 * comes back unchanged either way. Marking those `translate="no"` would cost
 * the surrounding sentence its translation to fix a danger that is not there,
 * so they are counted and named rather than failed.
 *
 * Note that JSX splits `Shared by {name}` into two text nodes, so a bare
 * `{expression}` is a node of its own and is checked as one. Only a string
 * composed in JavaScript arrives mixed.
 *
 * Usage, after building the app:
 *   node scripts/audit-user-content.mjs
 *   AUDIT_UC_PAGES=/activities node scripts/audit-user-content.mjs
 *
 * Exit codes: 0 every marker protected, 1 something is exposed, 2 the run
 * could not look (no build, no browser, nothing rendered).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSession } from "./audit-fixtures.mjs";
import { launchOptions } from "./chromium.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../dist/public");
const PORT = Number(process.env.AUDIT_UC_PORT ?? 4327);

const PAGES = (
  process.env.AUDIT_UC_PAGES ??
  "/dashboard,/activities,/classes,/goals,/lists,/schedule,/messages,/forum,/canvases,/people,/profile,/resources,/admin,/resources/101"
)
  .split(",")
  .filter(Boolean);

/**
 * The fields that hold something a person typed.
 *
 * Named rather than inferred, because the distinction is a judgement and not
 * a shape. `role`, `format`, `mode`, `status` and `visibility` are chosen from
 * fixed lists the product defines, so translating those is the whole point of
 * having a dictionary; the ones below came from a keyboard.
 *
 * `subject` and `gradeLevel` belong on this side, which is not obvious: they
 * read like taxonomies, and this list left them out at first. But the class
 * form asks for both with a plain text input -- a teacher types "Physics" and
 * "Year 12", or "Música" and "3º ESO" -- and on a catalogue resource they are
 * the provider's own labels rather than this app's. Either way, not our
 * wording to change. The profile page had already reached the same conclusion
 * and said so in a comment.
 */
const USER_TEXT = new Set([
  "subject",
  "gradeLevel",
  "gradeOrDept",
  "title",
  "name",
  "description",
  "body",
  "notes",
  "term",
  "answer",
  "bio",
  "comment",
  "message",
  "reflection",
  "instructions",
  "creatorName",
  "authorName",
  "question",
  "prompt",
  "content",
]);

/** Marks that no dictionary contains, so nothing translates them away. */
let markerCount = 0;
const nextMarker = () => `ucmark${(markerCount += 1)}`;

/** Replace every user-typed string in a fixture body with a marker. */
function markUserText(value) {
  if (Array.isArray(value)) return value.map(markUserText);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        USER_TEXT.has(key) && typeof inner === "string" && inner.length > 0
          ? // Kept as a sentence so layout, truncation and line-clamping
            // behave as they do with real text.
            `${nextMarker()} written by a person`
          : markUserText(inner),
      ]),
    );
  }
  return value;
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
 * Runs in the page: every marker on screen, and whether it is protected.
 *
 * Hidden nodes are skipped. A marker in a closed dialog is text nobody is
 * looking at, and reporting it would make the audit fail on markup that never
 * reaches a reader.
 */
const FIND_MARKERS = `(() => {
  const PROTECTED = '[translate="no"], [data-user-content]';
  const found = [];
  const label = (element) => {
    const parts = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const testid = node.getAttribute && node.getAttribute('data-testid');
      parts.unshift(testid ? node.tagName.toLowerCase() + '[' + testid + ']' : node.tagName.toLowerCase());
      if (parts.length >= 7) break;
    }
    return parts.join(' > ');
  };
  const visible = (element) => {
    if (!element) return false;
    if (!element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return element.getClientRects().length > 0;
  };

  // The whole of a node, or only part of it. Only the whole is at risk.
  const ONLY_THE_MARKER = /^ucmark\\d+ written by a person$/;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const match = /ucmark\\d+/.exec(node.data);
    if (!match) continue;
    const parent = node.parentElement;
    if (!visible(parent)) continue;
    found.push({
      marker: match[0],
      kind: 'text',
      mixed: !ONLY_THE_MARKER.test(node.data.trim()),
      protectedBy: parent.closest(PROTECTED) ? 'yes' : null,
      where: label(parent),
      snippet: (parent.parentElement || parent).innerText.slice(0, 90).replace(/\\s+/g, ' '),
      classes: parent.className && String(parent.className).slice(0, 70),
    });
  }

  // The bridge rewrites these two attributes as well as text.
  for (const element of document.querySelectorAll('[title], [aria-label], [placeholder], [alt]')) {
    for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
      const value = element.getAttribute(attribute);
      const match = value && /ucmark\\d+/.exec(value);
      if (!match) continue;
      if (!visible(element)) continue;
      found.push({
        marker: match[0],
        kind: attribute,
        mixed: !ONLY_THE_MARKER.test(value.trim()),
        protectedBy: element.closest(PROTECTED) ? 'yes' : null,
        where: label(element),
      });
    }
  }
  return found;
})()`;

const browser = await chromium.launch(launchOptions());

let rendered = 0;
const exposed = [];
let protectedCount = 0;
/** Markers sharing a node with product wording; safe, see the header. */
let mixedCount = 0;

for (const pagePath of PAGES) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  // Spanish, because that is the situation the audit is about: an account
  // with a dictionary loaded and a bridge running over the whole page.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("schoolar_language", "es");
    } catch {
      /* storage disabled */
    }
  });
  await installSession(context, {
    language: "es",
    // A student for every page but one. The admin panel renders a different
    // surface -- other people's names, emails and bios, which is the most
    // sensitive user content in the product -- and a student sees none of it.
    ...(pagePath === "/admin"
      ? { role: "admin", activeRole: "admin", accountRole: "admin" }
      : { role: "student" }),
    // Every user-typed field the fixture table would have answered, replaced
    // with something no dictionary knows -- see markUserText.
    transformBody: markUserText,
  });

  const page = await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:${PORT}${pagePath}`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    // The bridge translates on an animation frame after paint; give it its
    // chance, so this is checking the DOM the reader ends up with.
    await page.waitForTimeout(500);
    const found = await page.evaluate(FIND_MARKERS);
    rendered += 1;

    const seen = new Set();
    let mixedHere = 0;
    let exposedHere = 0;
    for (const entry of found) {
      const key = `${pagePath} ${entry.marker} ${entry.kind} ${entry.where}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (entry.protectedBy) protectedCount += 1;
      else if (entry.mixed) {
        mixedCount += 1;
        mixedHere += 1;
      } else {
        exposed.push({ page: pagePath, ...entry });
        exposedHere += 1;
      }
    }
    console.log(
      `  ${pagePath}: ${seen.size} marker(s), ${exposedHere} unprotected` +
        (mixedHere ? `, ${mixedHere} mixed into product wording` : ""),
    );
  } catch (error) {
    console.error(`  !  ${pagePath} failed: ${error.message}`);
  }
  await context.close();
}

await browser.close();
server.close();

/*
 * A run that rendered nothing proves nothing, and a run that found no user
 * content at all is a broken fixture rather than a clean product.
 */
if (rendered === 0) {
  console.error("\nNo page rendered. This run checked nothing.");
  process.exit(2);
}
if (protectedCount + mixedCount + exposed.length === 0) {
  console.error(
    "\nNo user content reached any page. The fixtures answered nothing, " +
      "so this run could not have found an exposed field.",
  );
  process.exit(2);
}

if (exposed.length) {
  const byPage = new Map();
  for (const entry of exposed) {
    byPage.set(entry.page, (byPage.get(entry.page) ?? []).concat(entry));
  }
  console.error(`\n${exposed.length} unprotected user-content render(s):`);
  for (const [page, entries] of byPage) {
    console.error(`\n  ${page}`);
    for (const entry of entries) {
      console.error(
        `    ${entry.kind === "text" ? "text" : `@${entry.kind}`}  ${entry.where}` +
          (entry.classes ? `\n        class: ${entry.classes}` : "") +
          (entry.snippet ? `\n        near: ${entry.snippet}` : ""),
      );
    }
  }
  console.error(
    `\nAdd translate="no" to the element that renders each. Without it the ` +
      `bridge rewrites this text the day it matches a dictionary entry -- ` +
      `which for a flashcard deck of English words is the first day.`,
  );
  process.exit(1);
}

console.log(
  `\n${protectedCount} user-content render(s) across ${rendered} page(s), ` +
    `all protected from the translation bridge` +
    (mixedCount
      ? `, and ${mixedCount} mixed into product wording, which the bridge ` +
        `re-emits unchanged.`
      : "."),
);
