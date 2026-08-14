#!/usr/bin/env node
/**
 * Renders the built app in a real browser and checks its pages for the failure
 * classes that type-checking and unit tests cannot see:
 *
 *  • text that fails WCAG contrast against its actual background — the bug that
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
 * Requires playwright-core and a Chromium build. In an environment that already
 * ships one, point CHROMIUM_PATH at it; otherwise `npx playwright install
 * chromium` once. Kept out of package.json dependencies deliberately — this is
 * a local/CI tool, not something the app bundle needs.
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
  process.env.AUDIT_SIGNED_IN_PAGES ?? "/dashboard,/profile,/resources,/settings"
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

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});

async function audit(pathname, colorScheme, width, { signedIn = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme,
  });
  const unfixtured = signedIn ? await installSession(ctx) : new Set();
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 140)));
  await page.goto(`http://127.0.0.1:${PORT}${pathname}`, {
    waitUntil: "load",
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);

  // Scroll the whole page so reveal-on-scroll content is given its chance,
  // then assert nothing is left invisible.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  await page.waitForTimeout(1200);

  const findings = {
    lowContrast: await page.evaluate(CONTRAST),
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
  return { pathname, colorScheme, width, signedIn, findings };
}

const results = [];
for (const pathname of PAGES) {
  for (const scheme of ["dark", "light"]) {
    results.push(await audit(pathname, scheme, 1280));
  }
  results.push(await audit(pathname, "dark", 390));
}
for (const pathname of SIGNED_IN_PAGES) {
  for (const scheme of ["dark", "light"]) {
    results.push(await audit(pathname, scheme, 1280, { signedIn: true }));
  }
  results.push(await audit(pathname, "dark", 390, { signedIn: true }));
}
await browser.close();
server.close();

let failed = 0;
const unfixtured = new Set();
for (const { pathname, colorScheme, width, signedIn, findings } of results) {
  const problems = [
    ...findings.lowContrast.map(
      (c) => `contrast ${c.ratio} < ${c.min} — "${c.text}"`,
    ),
    ...findings.invisibleAfterScroll.map(
      (t) => `still invisible after scrolling — "${t}"`,
    ),
    ...(findings.imagesMissingAlt
      ? [`${findings.imagesMissingAlt} image(s) with no alt`]
      : []),
    ...(findings.horizontalOverflow ? ["page scrolls horizontally"] : []),
    ...findings.pageErrors.map((e) => `page error: ${e}`),
  ];
  // Not a failure: an unmapped endpoint means the fixtures have fallen behind
  // the app, which is worth saying out loud without blocking the build.
  for (const p of findings.unfixtured ?? []) unfixtured.add(p);
  const label =
    `${pathname} [${colorScheme}, ${width}px` + (signedIn ? ", signed in]" : "]");
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
      " — answered empty. Add it to scripts/audit-fixtures.mjs.",
  );
}

console.log(
  failed === 0
    ? `\nAll ${results.length} page renders clean.`
    : `\n${failed} problem(s) across ${results.length} page renders.`,
);
process.exit(failed === 0 ? 0 : 1);
