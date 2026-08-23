#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Audit Search Results behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSession, FIXTURES } from "./audit-fixtures.mjs";
import { serveBuild } from "./serve-build.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/public",
);
const PORT = Number(process.env.AUDIT_PORT ?? 4329);
const QUERY = "AP Physics C: Electricity and Mechanics";

/**
 * A page of results shaped exactly as /resources/discover returns them,
 * cursors included.
 *
 * The cursors deliberately do not run in the order the results do, and the row
 * ids deliberately do not peak on the last result. Asking for more has to send
 * the *largest* of each, and a client that lazily sent the last result's values
 * would page from the wrong place — which on a growing catalog means handing the
 * reader results they already have.
 */
function discoverPage(titles, firstId = 1) {
  return titles.map((title, index) => ({
    title,
    url: `https://en.wikipedia.org/wiki/${title.replace(/[^A-Za-z0-9]+/g, "_")}`,
    description: `${title} is an open educational resource covering physics, electricity and mechanics for students.`,
    format: "article",
    source: "Wikipedia",
    thumbnailUrl: null,
    subject: "Physics",
    gradeLevel: "All levels",
    cursor: `${String(9995 + (index % 4)).padStart(4, "0")}.${index % 3}.${String(
      firstId + index,
    ).padStart(12, "0")}`,
    catalogId: firstId + ((index + 3) % titles.length),
    provenanceLevel: "established",
    provenanceSignals: ["Established publishing platform"],
    linkChecked: true,
    checkedAt: "2026-08-17T00:00:00.000Z",
  }));
}

/** The values a client that has read `results` must send to read further. */
function readTo(results) {
  return {
    after: results.reduce(
      (furthest, item) => (item.cursor > furthest ? item.cursor : furthest),
      "",
    ),
    sinceId: results.reduce(
      (highest, item) => Math.max(highest, item.catalogId),
      0,
    ),
  };
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
const SECOND_PAGE = discoverPage(
  [
    "IB Physics",
    "A-level Physics",
    "VCE Physics",
    "High school physics",
    "Experimental physics",
    "Medical physics",
    "Particle physics",
    "Solid state physics",
  ],
  FIRST_PAGE.length + 1,
);

function serve() {
  const server = serveBuild(ROOT, PORT);
  return server.ready.then(() => server);
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
  const discoverRequests = [];
  await context.route(
    (url) => url.pathname === "/api/resources/discover",
    async (route) => {
      const requested = new URL(route.request().url());
      discoverRequests.push(Object.fromEntries(requested.searchParams));
      const page = requested.searchParams.get("page") ?? "1";
      const asked = requested.searchParams.get("q") ?? "";
      if (!asked.toLowerCase().includes("physics")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(discoverPage(["Photosynthesis", "Calvin cycle"])),
        });
        return;
      }
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

  // Two formats at once. The panel was single-select throughout, which turned
  // the question into the wrong question: a reader who wants something to watch
  // *or* read had to search twice and compare two pages by hand.
  const formatFilter = page.locator('[data-testid="format-filter"]');
  await formatFilter.click();
  for (const format of ["pdf", "video"])
    await page.getByRole("checkbox", { name: format, exact: true }).click();
  await page.keyboard.press("Escape");
  check(
    (await formatFilter.textContent())?.includes("2 formats") === true,
    `two formats can be chosen at once (trigger reads "${(await formatFilter.textContent())?.trim()}")`,
  );
  await input.fill(QUERY);
  await input.press("Enter");
  await page.waitForTimeout(1200);
  check(
    discoverRequests.at(-1)?.format === "pdf,video",
    `both formats reach the API (format=${discoverRequests.at(-1)?.format})`,
  );
  await formatFilter.click();
  await page.getByRole("button", { name: /^clear$/i }).click();
  await page.keyboard.press("Escape");

  // The further page has to say where the reader got to. Paging by position
  // alone is what made a third of every "search more" page results the reader
  // already had: this endpoint stores works as it searches, so the positions
  // move underneath it.
  const expected = readTo(FIRST_PAGE);
  const morePage = discoverRequests.find((request) => request.page === "2");
  check(
    morePage?.after === expected.after,
    `asking for more resumes from where the page got to (after=${morePage?.after ?? "absent"})`,
  );
  check(
    morePage?.sinceId === String(expected.sinceId),
    `and from the newest work it holds (sinceId=${morePage?.sinceId ?? "absent"})`,
  );
  // ── A recent search has to replay the search, not just its words ───────────
  const excludeField = page.locator('[data-testid="exclude-source-filter"]');
  await page.locator('[data-testid="advanced-filters-toggle"]').click();
  await excludeField.waitFor({ state: "visible", timeout: 10_000 });
  await excludeField.fill("wikipedia");
  await input.fill(QUERY);
  await input.press("Enter");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="web-result-card"]').length > 0,
    undefined,
    { timeout: 15_000 },
  );
  check(
    discoverRequests.at(-1)?.excludeSource === "wikipedia",
    `an excluded source reaches the API (excludeSource=${discoverRequests.at(-1)?.excludeSource})`,
  );

  // Search something else, so the chip has to restore rather than coincide.
  // The panel stays open; toggling it again would close it.
  await excludeField.fill("");
  await input.fill("photosynthesis");
  await input.press("Enter");
  await page.waitForTimeout(800);
  check(
    !discoverRequests.at(-1)?.excludeSource,
    "clearing the exclusion drops it from the request",
  );

  const chip = page.getByRole("button", { name: QUERY, exact: true }).first();
  check(await chip.isVisible(), "the earlier search is offered as a chip");
  await chip.click();
  await page.waitForTimeout(1200);
  const heading = await page
    .locator("h2", { hasText: /open education catalog/i })
    .first()
    .textContent();
  check(
    (heading ?? "").includes(QUERY),
    `the chip re-runs its own search (heading: ${(heading ?? "").trim().slice(0, 60)})`,
  );
  check(
    (await excludeField.inputValue()) === "wikipedia",
    "the chip restores the filters it was searched with",
  );
  // The results are the ones that search returns, not the ones left over from
  // the search in between.
  const shown = await cards.first().textContent();
  check(
    /AP Physics/i.test(shown ?? ""),
    `the results are that search's results (first card: ${(shown ?? "").trim().slice(0, 26)})`,
  );
  // Whatever request the replay makes, if it makes one, carries the filters.
  const replayed = discoverRequests.findLast?.((r) => r.q === QUERY);
  check(
    !replayed || replayed.excludeSource === "wikipedia",
    "every request for that search carried its exclusion",
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
