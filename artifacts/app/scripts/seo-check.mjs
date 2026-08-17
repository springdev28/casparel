#!/usr/bin/env node
/**
 * Checks the BUILT index.html carries the product's key phrase.
 *
 * The app renders client-side, so the HTML shipped to the web root is the only
 * thing a crawler reads without executing JavaScript. Whatever is in these tags
 * is the search result: the title line, the grey sentence under it, and the
 * card that appears when the link is pasted into a chat. Nothing else on the
 * page gets a vote.
 *
 * That makes this copy unusually easy to lose. It lives in a static file that
 * no test rendered and no type checker sees, one careless edit from reverting
 * to a previous positioning while the site itself looks perfectly fine.
 *
 * Lengths are checked too, because Google truncates rather than wraps: a title
 * past roughly 60 characters or a description past roughly 155 is cut mid-word
 * in the result, which reads as carelessness at exactly the moment a stranger
 * is deciding whether to click.
 *
 * Usage: node scripts/seo-check.mjs   (after `pnpm run build`)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/public/index.html",
);

/** The key phrase. Change it here and in index.html together, deliberately. */
const SLOGAN = "Knowledge is treasure";
const DESCRIPTION =
  "An intelligent education platform that brings classes, resources, " +
  "research, planning, and progress into one connected workspace.";

/** Google truncates past roughly these widths. */
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;

if (!fs.existsSync(BUILT)) {
  console.error(`No build at ${BUILT}. Run the app build first.`);
  process.exit(2);
}
const html = fs.readFileSync(BUILT, "utf8");

const problems = [];
const check = (label, ok, detail = "") => {
  if (!ok) problems.push(`${label}${detail ? `: ${detail}` : ""}`);
  return ok;
};

function tag(re, label) {
  const match = html.match(re);
  if (!match) {
    problems.push(`${label} is missing from the built HTML`);
    return null;
  }
  // The build escapes entities; compare against decoded text.
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const title = tag(/<title>([^<]*)<\/title>/, "<title>");
const description = tag(
  /<meta\s+name="description"\s+content="([^"]*)"/,
  'meta name="description"',
);
const ogTitle = tag(/<meta\s+property="og:title"\s+content="([^"]*)"/, "og:title");
const ogDesc = tag(
  /<meta\s+property="og:description"\s+content="([^"]*)"/,
  "og:description",
);
const twTitle = tag(
  /<meta\s+name="twitter:title"\s+content="([^"]*)"/,
  "twitter:title",
);
const twDesc = tag(
  /<meta\s+name="twitter:description"\s+content="([^"]*)"/,
  "twitter:description",
);

if (title !== null) {
  check("title does not carry the key phrase", title.includes(SLOGAN), title);
  check(
    "title is longer than Google shows",
    title.length <= MAX_TITLE,
    `${title.length} > ${MAX_TITLE}`,
  );
}
if (description !== null) {
  check(
    "meta description is not the key sentence",
    description === DESCRIPTION,
    description,
  );
  check(
    "description is longer than Google shows",
    description.length <= MAX_DESCRIPTION,
    `${description.length} > ${MAX_DESCRIPTION}`,
  );
}

// The share card and the search result must not disagree; a link pasted into a
// chat is often the first time anyone sees the positioning.
check("og:title does not match <title>", ogTitle === title);
check("og:description does not match the meta description", ogDesc === description);
check("twitter:title does not match <title>", twTitle === title);
check(
  "twitter:description does not match the meta description",
  twDesc === description,
);

// Em dashes have shown up in a live Google result for this site before. They
// survive a copy-paste from a document and read as machine-written.
for (const [label, value] of [
  ["title", title],
  ["description", description],
]) {
  if (value && /[—–]/.test(value)) {
    problems.push(`${label} contains an em or en dash: ${value}`);
  }
}

// Structured data is what Google reads for the knowledge panel and sitelinks.
const ld = html.match(
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
);
if (!ld) {
  problems.push("structured data block is missing");
} else {
  try {
    const graph = JSON.parse(ld[1])["@graph"] ?? [];
    const slogans = graph.filter((node) => node.slogan).map((n) => n.slogan);
    check(
      "no structured-data node carries the slogan",
      slogans.some((s) => s.includes(SLOGAN)),
    );
    const descs = graph.filter((n) => n.description).map((n) => n.description);
    check(
      "structured-data description does not match the key sentence",
      descs.some((d) => d === DESCRIPTION),
    );
  } catch (error) {
    problems.push(`structured data does not parse: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// The per-route metadata the SERVER substitutes into the shell.
//
// index.html alone does not decide what Google shows. api-server fills the
// shell in per address from _seo/routes.json (see lib/routeMetadata.ts), so a
// correct index.html and a stale route table still produce a stale search
// result for every page including the home page. Checking only the shell is
// how a title can look fixed and ship unfixed.
// ---------------------------------------------------------------------------
const ROUTES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/public/_seo/routes.json",
);

if (!fs.existsSync(ROUTES)) {
  problems.push(`route metadata missing at ${ROUTES}`);
} else {
  let routeFile;
  try {
    routeFile = JSON.parse(fs.readFileSync(ROUTES, "utf8"));
  } catch (error) {
    problems.push(`route metadata does not parse: ${error.message}`);
  }
  const routes = routeFile?.routes ?? {};
  const home = routes["/"];
  if (!home) {
    problems.push("route metadata has no entry for the home page");
  } else {
    check(
      "served home title does not carry the key phrase",
      typeof home.title === "string" && home.title.includes(SLOGAN),
      home.title,
    );
    check(
      "served home description is not the key sentence",
      home.description === DESCRIPTION,
      home.description,
    );
    check(
      "served home title disagrees with index.html",
      home.title === title,
      `${home.title} vs ${title}`,
    );
  }

  for (const [route, meta] of Object.entries(routes)) {
    if (typeof meta?.title === "string") {
      if (/[—–]/.test(meta.title)) {
        problems.push(`${route} title contains an em or en dash: ${meta.title}`);
      }
      if (meta.title.length > MAX_TITLE) {
        problems.push(`${route} title is ${meta.title.length} chars, over ${MAX_TITLE}`);
      }
    }
    if (typeof meta?.description === "string") {
      if (/[—–]/.test(meta.description)) {
        problems.push(`${route} description contains an em or en dash`);
      }
      if (meta.description.length > MAX_DESCRIPTION) {
        problems.push(
          `${route} description is ${meta.description.length} chars, over ${MAX_DESCRIPTION}`,
        );
      }
    }
  }
}

console.log("\nSearch result preview\n");
console.log(`  ${title ?? "(no title)"}`);
console.log("  https://casparel.com");
console.log(`  ${description ?? "(no description)"}\n`);

if (problems.length === 0) {
  console.log("All search-preview checks passed.");
  process.exit(0);
}
for (const problem of problems) console.log(`FAIL ${problem}`);
console.log(`\n${problems.length} problem(s) with the search preview.`);
process.exit(1);
