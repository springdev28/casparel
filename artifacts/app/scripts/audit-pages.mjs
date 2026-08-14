#!/usr/bin/env node
/**
 * Renders the built app in a real browser and checks its pages for the failure
 * classes that type-checking and unit tests cannot see:
 *
 *  • text that fails WCAG contrast against its actual background, the bug that
 *    made "Sign in" and "More filters" invisible in dark mode,
 *  • elements left stuck at opacity 0 by reveal-on-scroll, which silently
 *    swallows content,
 *  • horizontal overflow, missing image alt text, and uncaught page errors.
 *
 * Signed-in pages are covered too, rendered against the fixtures in
 * audit-fixtures.mjs rather than a live API, because that is where the
 * regressions that reached production actually were.
 *
 * Usage:
 *   pnpm --filter @workspace/app run build     # dist/public must exist
 *   node scripts/audit-pages.mjs               # exits non-zero on findings
 *
 * Requires a Chromium build. Preinstalled browsers are found automatically
 * (see chromiumExecutable below); CHROMIUM_PATH overrides the search, and
 * `npx playwright install chromium` is the fallback for a bare machine.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSession } from "./audit-fixtures.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/public",
);
const PORT = Number(process.env.AUDIT_PORT ?? 4321);
const PAGES = (process.env.AUDIT_PAGES ?? "/,/auth/login,/auth/register").split(",");
// Signed-in pages, rendered against fixtures rather than a live API. These are
// where the regressions that reached production actually were, so they matter
// more than the public pages, not less.
const SIGNED_IN_PAGES = (
  process.env.AUDIT_SIGNED_IN_PAGES ??
  "/dashboard,/profile,/resources,/catalog,/settings,/admin"
)
  .split(",")
  .filter(Boolean);

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
  console.error(
    "playwright-core is not installed. Install it locally to run this audit:\n" +
      "  npm i -D playwright-core",
  );
  process.exit(2);
}

// Serve the build, falling back to index.html so client-side routes resolve.
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
 * Runs in the page: the accessibility faults a browser can see but a type
 * checker cannot. A control with no accessible name is announced as just
 * "button", a field with no label as an empty text box, and a skipped heading
 * level breaks the outline screen-reader users navigate by.
 */
const A11Y = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (el) => (
    el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
    el.textContent || el.getAttribute('title') || ''
  ).trim();

  const namelessControls = [...document.querySelectorAll('button, a[href], [role="button"]')]
    .filter(visible).filter((el) => !name(el))
    .map((el) => (el.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 70));

  const unlabelledFields = [...document.querySelectorAll('input, select, textarea')]
    .filter(visible).filter((el) => el.type !== 'hidden')
    .filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')
      && !(el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'))
      && !el.closest('label'))
    .map((el) => (el.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 70));

  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((h) => +h.tagName[1]);
  const headingSkips = [];
  for (let i = 1; i < levels.length; i++)
    if (levels[i] - levels[i - 1] > 1) headingSkips.push('h' + levels[i - 1] + ' to h' + levels[i]);

  return { namelessControls, unlabelledFields, headingSkips };
})()`;

/** Runs in the page: WCAG contrast for every leaf text element. */
const CONTRAST = `(() => {
  const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*r + 0.7152*g + 0.0722*b; };
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x)); return { rgb: [p[0],p[1],p[2]], a: p.length>3 ? p[3] : 1 }; };
  const bgOf = (el) => { let n = el;
    while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c.rgb; n = n.parentElement; }
    const c = parse(getComputedStyle(document.body).backgroundColor); return c ? c.rgb : [255,255,255]; };
  const out = [];
  for (const el of document.querySelectorAll('a,button,h1,h2,h3,p,span,li,label')) {
    const txt = (el.textContent || '').trim();
    if (!txt || el.children.length > 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') continue;
    if (parseFloat(st.opacity) === 0) continue;
    const fg = parse(st.color); if (!fg) continue;
    const L1 = lum(fg.rgb), L2 = lum(bgOf(el));
    const ratio = (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
    const size = parseFloat(st.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(st.fontWeight) >= 700);
    const min = large ? 3 : 4.5;
    if (ratio < min) out.push({ text: txt.slice(0,45), ratio: +ratio.toFixed(2), min });
  }
  return out;
})()`;

/**
 * Playwright looks for a browser build whose revision matches the
 * playwright-core version it ships with, and refuses to start when that exact
 * revision is missing. Environments that preinstall Chromium (CI images, this
 * sandbox) pin one revision, so any playwright-core bump breaks the audit with
 * "Executable doesn't exist" even though a perfectly usable browser is sitting
 * on disk. Prefer an explicit CHROMIUM_PATH, then a preinstalled browser, then
 * fall back to whatever Playwright manages itself.
 */
function chromiumExecutable() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
      : null,
    "/opt/pw-browsers/chromium",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

const executablePath = chromiumExecutable();
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox"],
});

async function audit(pathname, colorScheme, width, options = {}) {
  const { signedIn = false, palette } = options;
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme,
  });
  const unfixtured = signedIn
    ? await installSession(ctx, { palette })
    : new Set();
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 140)));
  await page.goto(`http://127.0.0.1:${PORT}${pathname}`, {
    waitUntil: "load",
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);

  // Scroll the whole page so reveal-on-scroll content is given its chance,
  // then assert nothing is left invisible. The step count is fixed up front:
  // re-reading scrollHeight each iteration means a page that grows as you
  // scroll it (lazy lists, charts that mount late) can extend the loop
  // indefinitely, and an audit that hangs blocks every deploy behind it.
  await page.evaluate(async () => {
    const STEP = 500;
    const MAX_STEPS = 60; // 30,000px of page is far more than any view here
    const steps = Math.min(
      MAX_STEPS,
      Math.ceil(document.body.scrollHeight / STEP),
    );
    for (let i = 0; i <= steps; i++) {
      window.scrollTo(0, i * STEP);
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  await page.waitForTimeout(1200);

  const a11y = await page.evaluate(A11Y);
  const findings = {
    lowContrast: await page.evaluate(CONTRAST),
    ...a11y,
    invisibleAfterScroll: await page.$$eval(".reveal", (els) =>
      els
        .filter((e) => getComputedStyle(e).opacity === "0")
        .map((e) => (e.textContent || "").slice(0, 45)),
    ),
    imagesMissingAlt: await page.$$eval(
      "img",
      (els) => els.filter((e) => !e.getAttribute("alt")).length,
    ),
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    ),
    pageErrors,
    unfixtured: [...unfixtured],
  };
  await ctx.close();
  return { pathname, colorScheme, width, signedIn, palette, findings };
}

/**
 * Run one render with a hard ceiling. A single page that never settles used to
 * hang the whole audit, and since the deploy waits on it, that stalls every
 * release behind a 20-minute job timeout with no clue which page was at fault.
 * A timeout is reported as a finding, naming the page.
 */
const RENDER_TIMEOUT_MS = Number(process.env.AUDIT_RENDER_TIMEOUT_MS ?? 90_000);

async function auditGuarded(pathname, colorScheme, width, options = {}) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          pathname,
          colorScheme,
          width,
          signedIn: options.signedIn ?? false,
          palette: options.palette,
          findings: {
            lowContrast: [],
            invisibleAfterScroll: [],
            imagesMissingAlt: 0,
            horizontalOverflow: false,
            pageErrors: [
              `render did not finish within ${RENDER_TIMEOUT_MS / 1000}s`,
            ],
            namelessControls: [],
            unlabelledFields: [],
            headingSkips: [],
            unfixtured: [],
          },
        }),
      RENDER_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([
      audit(pathname, colorScheme, width, options),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const pathname of PAGES) {
  for (const scheme of ["dark", "light"]) {
    results.push(await auditGuarded(pathname, scheme, 1280));
  }
  results.push(await auditGuarded(pathname, "dark", 390));
}
// Signed-in pages vary by saved palette, not by prefers-color-scheme, so that
// is what is swept here.
for (const pathname of SIGNED_IN_PAGES) {
  for (const palette of ["dark", "light"]) {
    results.push(
      await auditGuarded(pathname, palette, 1280, { signedIn: true, palette }),
    );
  }
  results.push(
    await auditGuarded(pathname, "dark", 390, { signedIn: true, palette: "dark" }),
  );
}
await browser.close();
server.close();

let failed = 0;
const unfixtured = new Set();
for (const {
  pathname,
  colorScheme,
  width,
  signedIn,
  palette,
  findings,
} of results) {
  const problems = [
    ...findings.lowContrast.map(
      (c) => `contrast ${c.ratio} < ${c.min} on "${c.text}"`,
    ),
    ...findings.invisibleAfterScroll.map(
      (t) => `still invisible after scrolling: "${t}"`,
    ),
    ...(findings.imagesMissingAlt
      ? [`${findings.imagesMissingAlt} image(s) with no alt`]
      : []),
    ...(findings.horizontalOverflow ? ["page scrolls horizontally"] : []),
    ...(findings.namelessControls ?? []).map(
      (c) => `control has no accessible name: ${c}`,
    ),
    ...(findings.unlabelledFields ?? []).map(
      (c) => `form field has no label: ${c}`,
    ),
    ...(findings.headingSkips ?? []).map((s) => `heading level skips ${s}`),
    ...findings.pageErrors.map((e) => `page error: ${e}`),
  ];
  // Not a failure: an unmapped endpoint means the fixtures have fallen behind
  // the app, which is worth saying out loud without blocking the build.
  for (const p of findings.unfixtured ?? []) unfixtured.add(p);
  const label = signedIn
    ? `${pathname} [${palette} palette, ${width}px, signed in]`
    : `${pathname} [${colorScheme}, ${width}px]`;
  if (problems.length === 0) {
    console.log(`ok   ${label}`);
  } else {
    failed += problems.length;
    console.log(`FAIL ${label}`);
    for (const p of problems) console.log(`       ${p}`);
  }
}

if (unfixtured.size) {
  console.log(
    `\nnote: no fixture for ${[...unfixtured].sort().join(", ")}` +
      ". Answered empty; add it to scripts/audit-fixtures.mjs.",
  );
}

console.log(
  failed === 0
    ? `\nAll ${results.length} page renders clean.`
    : `\n${failed} problem(s) across ${results.length} page renders.`,
);
process.exit(failed === 0 ? 0 : 1);
