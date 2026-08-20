#!/usr/bin/env node
/**
 * An empty state must never stand in for a loading one.
 *
 * "Your library is empty" is a factual claim about the account. Painting it
 * while the data is still in flight tells a returning user their work is gone,
 * which is worse than a spinner and worse than a blank panel.
 *
 * The failure is easy to write and invisible in review: /resources is a public
 * route, the library query is gated on being signed in, and being signed in is
 * itself an in-flight request. So the query reports "not loading" for the whole
 * /users/me round trip, and the empty branch renders. Gating on the library
 * query alone narrows that window; it does not close it.
 *
 * This drives it directly - hold /users/me, watch the DOM - because no unit
 * test sees a paint that lasts one round trip.
 *
 * Usage:
 *   pnpm --filter @workspace/app run build
 *   node scripts/audit-loading.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { installSession } from "./audit-fixtures.mjs";
import { launchOptions } from "./chromium.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/public");
const PORT = 4412;
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(ROOT, url.pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((ready) => {
  server.listen(PORT, () => ready(undefined));
});

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await installSession(ctx);

// Hold /users/me for a beat. This is the window in which the catalog query is
// still disabled and reports "not loading".
await ctx.route("**/api/users/me", async (route) => {
  await new Promise((r) => setTimeout(r, 1500));
  return route.fallback();
});

// The library filters on submittedById === me.id, and the shared fixture's
// resource has no submitter, so the library is legitimately empty and every
// sighting would be a true one. Give user 1 a resource: from here on, ANY
// "Your library is empty" is necessarily false.
await ctx.route("**/api/resources*", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      {
        id: 101, title: "Owned by the signed-in user",
        description: "Present so the library is not genuinely empty.",
        url: "https://example.org/owned", type: "book", subject: "Mathematics",
        gradeLevel: "Undergraduate", language: "en", source: "Open Library",
        verificationStatus: "verified", verificationNote: null,
        submittedById: 1, averageRating: 4.5, ratingCount: 3,
        createdAt: "2026-02-11T09:00:00.000Z",
      },
    ]),
  }),
);

const page = await ctx.newPage();
const sawEmpty = [];
// Sample the DOM while the page settles.
const poll = setInterval(async () => {
  try {
    const t = await page.evaluate(() => document.body?.innerText ?? "");
    if (/Your library is empty(?!\. Save a resource first)/.test(t)) sawEmpty.push(Date.now());
  } catch {}
}, 120);

await page.goto(`http://127.0.0.1:${PORT}/resources?view=library`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
clearInterval(poll);

console.log(
  sawEmpty.length === 0
    ? 'PASS: "Your library is empty" never painted while loading'
    : `FAIL: false empty state painted ${sawEmpty.length} time(s) during load`,
);

await browser.close();
server.close();
process.exit(sawEmpty.length === 0 ? 0 : 1);
