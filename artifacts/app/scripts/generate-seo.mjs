#!/usr/bin/env node
/**
 * Generates public/robots.txt and public/sitemap.xml before `vite build`.
 *
 * A resource-discovery product has to be crawlable, but the app is a
 * client-rendered SPA — search engines only ever see whatever static files
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
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "..", "public");

const rawSiteUrl = process.env.SITE_URL ?? "https://casparel.com";
// Normalise: absolute origin, no trailing slash.
const origin = rawSiteUrl.replace(/\/+$/, "");

/**
 * Publicly reachable, crawlable routes (see App.tsx <Router/>).
 * Authenticated-only routes are intentionally excluded — they redirect to
 * login and hold no indexable content. Individual /resources/:id pages are
 * data-driven; a static build cannot enumerate them, so they are covered by
 * the /resources hub here and can be appended later from an API export.
 */
const routes = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/resources", changefreq: "daily", priority: "0.9" },
  { path: "/auth/login", changefreq: "monthly", priority: "0.4" },
  { path: "/auth/register", changefreq: "monthly", priority: "0.4" },
];

const lastmod = (process.env.SITEMAP_LASTMOD ?? "").trim();
const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";

const urls = routes
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

// Note: robots.txt is intentionally NOT emitted as a static file. On the
// production host a static robots.txt at the web root gets served directly by
// the CDN/static layer, which shadowed the app and pinned an old
// "Disallow: /". Instead the API app owns GET /robots.txt (see api-server
// app.ts), so removing the static file here lets every request reach that
// route — the same way sitemap.xml is already served by the app.
await mkdir(publicDir, { recursive: true });
await writeFile(resolve(publicDir, "sitemap.xml"), sitemap, "utf8");

console.log(`[seo] wrote sitemap.xml for ${origin} (robots.txt is served by the API app)`);
