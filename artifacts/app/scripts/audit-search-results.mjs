#!/usr/bin/env node
/**
 * Drives the Resources search in a real browser and checks what a reader
 * actually gets: how many result cards render, whether "Search more resources"
 * adds to them, and where the loading placeholders sit while it does.
 *
 * The API is fixtured, so this checks the *page*, not the search — the two
 * failures it exists for were both client-side and invisible to an API check.
 * A first page of sixteen results rendered three cards, and appending a page
 * put the loading placeholders above the results already on screen, pushing
 * them down the page.
 *
 * Usage:
 *   pnpm --filter @workspace/app run build     # dist/public must exist
 *   node scripts/audit-search-results.mjs      # exits non-zero on findings
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSession, FIXTURES } from "./audit-fixtures.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/public",
);
const PORT = Number(process.env.AUDIT_PORT ?? 4329);
const QUERY = "AP Physics C: Electricity and Mechanics";

/** A page of results shaped exactly as /resources/discover returns them. */
function discoverPage(titles) {
  return titles.map((title) => ({
    title,
    url: `https://en.wikipedia.org/wiki/${title.replace(/[^A-Za-z0-9]+/g, "_")}`,
    description: `${title} is an open educational resource covering physics, electricity and mechanics for students.`,
    format: "article",
    source: "Wikipedia",
    thumbnailUrl: null,
    subject: "Physics",
    gradeLevel: "All levels",
    provenanceLevel: "established",
    provenanceSignals: ["Established publishing platform"],
    linkChecked: true,
    checkedAt: "2026-08-17T00:00:00.000Z",
  }));
}

const FIRST_PAGE = discoverPage([
  "AP Physics C Mechanics",
  "AP Physics C Electricity and Magnetism",
  "AP Physics",
  "AP Physics 1",
  "AP Physics B",
  "Newton's laws of motion",
  "University Physics",
  "Electromagnetism",
  "Quantum mechanics",
  "Branches of physics",
  "Glossary of physics",
  "History of physics",
  "Modern Physics",
  "Physics Study Guide",
  "Theoretical physics",
  "Molecular physics",
]);
const SECOND_PAGE = discoverPage([
  "IB Physics",
  "A-level Physics",
  "VCE Physics",
  "High school physics",
  "Experimental physics",
  "Medical physics",
  "Particle physics",
  "Solid state physics",
]);

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".json")) return "application/json";
  return "text/html; charset=utf-8";
}

function serve() {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const candidate = path.join(ROOT, requested);
    const file =
      requested !== "/" && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
        ? candidate
        : path.join(ROOT, "index.html");
    res.writeHead(200, { "Content-Type": contentType(file) });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const roots = ["/opt/pw-browsers"];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      for (const candidate of [
        path.join(root, entry, "chrome-linux", "chrome"),
        path.join(root, entry, "chrome-linux", "headless_shell"),
      ])
        if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const findings = [];
function check(ok, message) {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) findings.push(message);
}

const server = await serve();
const { chromium } = await import("playwright-core");
const browser = await chromium.launch({
  executablePath: chromiumExecutable(),
  args: ["--no-sandbox"],
});

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await installSession(context);

  // Fixture the search itself: page 1 and page 2 of the open catalog.
  await context.route(
    (url) => url.pathname === "/api/resources/discover",
    async (route) => {
      const page = new URL(route.request().url()).searchParams.get("page") ?? "1";
      // A real later page goes out to the open providers, so the loading state
      // is on screen for seconds. Without the delay it is never observable and
      // the check that placed the placeholders would pass vacuously.
      if (page !== "1") await new Promise((done) => setTimeout(done, 1200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          page === "1" ? FIRST_PAGE : page === "2" ? SECOND_PAGE : [],
        ),
      });
    },
  );
  // The library panel has nothing for this query, as on the live site.
  await context.route(
    (url) => url.pathname === "/api/resources",
    async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          url.searchParams.get("q") ? [] : FIXTURES["/api/resources"],
        ),
      });
    },
  );

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/resources`, { waitUntil: "networkidle" });

  const input = page.locator('[data-testid="search-input"]');
  await input.fill(QUERY);
  await input.press("Enter");

  const cards = page.locator('[data-testid="web-result-card"]');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="web-result-card"]').length > 0,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(600);

  const firstCount = await cards.count();
  check(
    firstCount === FIRST_PAGE.length,
    `first page renders every result: ${firstCount} of ${FIRST_PAGE.length} cards`,
  );

  // ── Appending a page: the placeholders must not displace what is on screen ──
  const more = page.getByRole("button", { name: /search more/i });
  check(await more.isVisible(), '"Search more resources" is offered');

  // Distance from the section heading to the first result. The app scrolls an
  // inner container rather than the document, so any absolute position moves
  // with the scroll; the gap between two elements does not.
  const gapBelowHeading = () =>
    page.evaluate(() => {
      const heading = [...document.querySelectorAll("h2")].find((h) =>
        /open education catalog|sources & channels/i.test(h.textContent ?? ""),
      );
      const card = document.querySelector('[data-testid="web-result-card"]');
      if (!heading || !card) return null;
      return Math.round(
        card.getBoundingClientRect().top - heading.getBoundingClientRect().top,
      );
    });
  const topBefore = await gapBelowHeading();
  await more.click();
  await page.waitForTimeout(300);

  const skeletons = page.locator('[data-testid="card-skeleton"]');
  const skeletonCount = await skeletons.count();
  check(skeletonCount > 0, `a further page shows it is loading (${skeletonCount} placeholders)`);
  if (skeletonCount > 0) {
    const placeholderTop = await skeletons
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
    const lastCardTop = await cards
      .last()
      .evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
    check(
      placeholderTop > lastCardTop,
      `placeholders sit below the results, not above them (placeholders at ${placeholderTop}, last result at ${lastCardTop})`,
    );
  }
  const topAfter = await gapBelowHeading();
  check(
    topAfter !== null && Math.abs(topAfter - topBefore) < 4,
    `results stay under their heading while more load (gap ${topBefore}px then ${topAfter}px)`,
  );

  await page.waitForFunction(
    (target) =>
      document.querySelectorAll('[data-testid="web-result-card"]').length >= target,
    FIRST_PAGE.length + SECOND_PAGE.length,
    { timeout: 15_000 },
  );
  const secondCount = await cards.count();
  check(
    secondCount === FIRST_PAGE.length + SECOND_PAGE.length,
    `appending keeps both pages: ${secondCount} of ${FIRST_PAGE.length + SECOND_PAGE.length} cards`,
  );
} finally {
  await browser.close();
  server.close();
}

if (findings.length) {
  console.error(`\n${findings.length} finding(s) in the search results view.`);
  process.exit(1);
}
console.log("\nSearch results view is clean.");
