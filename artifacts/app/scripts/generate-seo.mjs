#!/usr/bin/env node
/**
 * @fileOverview Web support role: configures or validates the Generate Seo part of the Vite/React application.
 * System connection: participates in browser development, build, quality checks, or deployment.
 */
/**
 * Generates public/robots.txt and public/sitemap.xml before `vite build`.
 *
 * A resource-discovery product has to be crawlable, but the app is a
 * client-rendered SPA, so search engines only ever see whatever static files
 * sit at the site root. Two things previously worked against that: a
 * robots.txt that (on the deployed host) blocked Googlebot, and a
 * /sitemap.xml that resolved to the SPA HTML shell instead of real XML.
 *
 * This script makes both deterministic and part of the build output so the
 * next deploy ships a correct, self-consistent crawl configuration.
 *
 * The canonical origin is taken from SITE_URL (fall back to the current
 * production host). Set SITE_URL when moving to a custom domain and rebuild.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "..", "public");

const rawSiteUrl = process.env.SITE_URL ?? "https://casparel.com";
// Normalise: absolute origin, no trailing slash.
const origin = rawSiteUrl.replace(/\/+$/, "");

/**
 * Publicly reachable routes (see App.tsx <Router/>), and what each one is.
 *
 * Every title is "Casparel: something", with a colon rather than a dash. An em
 * dash survives a copy-paste out of a document, renders as a stray glyph in a
 * search result, and reads as machine-written; one had already reached a live
 * Google result for this site.
 *
 * The titles and descriptions are here, not only in index.html, because a
 * client-rendered app serves one HTML shell for every address. Every route
 * therefore claimed the same title, the same description and — worst of all —
 * `<link rel="canonical" href="https://casparel.com/">`. A canonical tag is a
 * declaration that a page *is* another page, so Search Console had a handful of
 * addresses reported as a redirect or "discovered, currently not indexed" while
 * only the home page was ever indexed. The server fills these in per route (see
 * app.ts), so /resources says it is /resources.
 *
 * `sitemap: false` means the page is served with its own title but is not
 * offered for indexing. A sign-in form has nothing to rank, and asking for it to
 * be indexed spends crawl budget to be told no.
 *
 * Authenticated-only routes are absent altogether: they redirect to login and
 * hold no indexable content. Individual /resources/:id pages are data-driven; a
 * static build cannot enumerate them, so they are covered by the /resources hub
 * and can be appended later from an API export.
 */
const routes = [
  {
    path: "/",
    changefreq: "daily",
    priority: "1.0",
    // Matches index.html exactly, so the home page is served untouched.
    title: "Casparel: Knowledge is treasure",
    description:
      "An intelligent education platform that brings classes, resources, research, planning, and progress into one connected workspace.",
    heading: "Knowledge is treasure",
  },
  {
    path: "/resources",
    changefreq: "daily",
    priority: "0.9",
    title: "Casparel: Open education library",
    description:
      "Search a free library of open textbooks, courses and videos drawn from Wikibooks, Wikiversity, Open Library and other open sources.",
    heading: "The open education library",
  },
  {
    path: "/download",
    changefreq: "monthly",
    priority: "0.6",
    title: "Casparel: Download for iPhone, Android and desktop",
    description:
      "Install Casparel on iPhone, Android, macOS, Windows or Linux. One account, with the same library, classes, schedule and source research on every device.",
    heading: "The same workspace, on whatever you study with",
  },
  {
    path: "/code-signing",
    changefreq: "yearly",
    priority: "0.3",
    title: "Casparel: Code signing and download verification",
    description:
      "How Casparel desktop installers are built and signed, what a signature proves, and how to verify a download on Windows, macOS or Linux.",
    heading: "How to check that a Casparel download is really ours",
  },
  {
    path: "/terms",
    changefreq: "yearly",
    priority: "0.3",
    title: "Casparel: Terms of Service",
    description: "The terms you agree to when you use Casparel.",
    heading: "Terms of Service",
  },
  {
    path: "/privacy",
    changefreq: "yearly",
    priority: "0.3",
    title: "Casparel: Privacy Policy",
    description:
      "What Casparel stores about you, why, and how to have it deleted.",
    heading: "Privacy Policy",
  },
  {
    path: "/delete-account",
    changefreq: "yearly",
    priority: "0.4",
    title: "Casparel: Delete your account",
    description:
      "How to permanently delete a Casparel account, request deletion without the app, and understand what data is removed or retained.",
    heading: "Delete your Casparel account",
  },
  {
    path: "/auth/login",
    sitemap: false,
    title: "Casparel: Sign in",
    description: "Sign in to Casparel.",
    heading: "Sign in to Casparel",
  },
  {
    path: "/auth/register",
    sitemap: false,
    title: "Casparel: Create a free account",
    description:
      "Create a free Casparel account to save resources, plan classes and track what you are studying.",
    heading: "Create a free Casparel account",
  },
];

/**
 * `lastmod` is the signal crawlers use to decide a page is worth fetching
 * again. It was previously emitted only when SITEMAP_LASTMOD was set, which
 * nothing did, so every sitemap shipped without one and a stale search result
 * (an old title, an old description) could sit in the index long after the
 * page had actually changed.
 *
 * The date of the last commit is used rather than the build clock, so the
 * value reflects when the site genuinely changed instead of resetting on every
 * rebuild of identical content. Falls back to today when git is unavailable,
 * for example in a tarball build.
 */
function lastCommitDate() {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs"], {
      cwd: here,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const lastmod =
  (process.env.SITEMAP_LASTMOD ?? "").trim() ||
  lastCommitDate() ||
  new Date().toISOString().slice(0, 10);
const lastmodTag = `\n    <lastmod>${lastmod}</lastmod>`;

const urls = routes
  .filter((route) => route.sitemap !== false)
  .map(
    ({ path, changefreq, priority }) =>
      `  <url>\n    <loc>${origin}${path}</loc>${lastmodTag}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
  )
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

/**
 * What the server needs to fill the HTML shell in for each route.
 *
 * Written into the build output rather than compiled into the server so the
 * route list has one home. A deploy whose bundle predates this file simply gets
 * the old behaviour — one shell, one canonical — instead of failing.
 */
const routeMetadata = {
  origin,
  routes: Object.fromEntries(
    routes.map(({ path, title, description, heading, sitemap: inSitemap }) => [
      path,
      {
        title,
        description,
        heading,
        canonical: `${origin}${path}`,
        ...(inSitemap === false ? { noindex: true } : {}),
      },
    ]),
  ),
};

// Note: robots.txt is intentionally NOT emitted as a static file. On the
// production host a static robots.txt at the web root gets served directly by
// the CDN/static layer, which shadowed the app and pinned an old
// "Disallow: /". Instead the API app owns GET /robots.txt (see api-server
// app.ts), so removing the static file here lets every request reach that
// route, the same way sitemap.xml is already served by the app.
await mkdir(resolve(publicDir, "_seo"), { recursive: true });
await writeFile(resolve(publicDir, "sitemap.xml"), sitemap, "utf8");
await writeFile(
  resolve(publicDir, "_seo", "routes.json"),
  `${JSON.stringify(routeMetadata, null, 2)}\n`,
  "utf8",
);

console.log(
  `[seo] wrote sitemap.xml (${routes.filter((r) => r.sitemap !== false).length} urls) and _seo/routes.json (${routes.length} routes) for ${origin}; robots.txt is served by the API app`,
);
