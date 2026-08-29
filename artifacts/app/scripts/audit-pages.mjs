#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Audit Pages behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inParallel } from "./in-parallel.mjs";
import { installSession } from "./audit-fixtures.mjs";
import { serveBuild } from "./serve-build.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/public",
);
const PORT = Number(process.env.AUDIT_PORT ?? 4321);
// /terms and /privacy are in the default set because the app stores require
// them to resolve for a signed-out reviewer, so a regression there is a
// submission blocker rather than a cosmetic issue.
// The two share links are here because they are the only pages in the product
// a person reaches without an account and without having chosen to: somebody
// sends a link, and this page is the whole of what Casparel looks like to
// them. Neither had been rendered by any audit.
const PAGES = (
  process.env.AUDIT_PAGES ??
  "/,/resources,/support,/download,/code-signing,/plans,/auth/login,/auth/register,/terms,/privacy,/canvas/shared/aud1t-t0ken,/canvas/shared/aud1t-empty,/activities/shared/aud1t-t0ken"
).split(",");
// Signed-in pages, rendered against fixtures rather than a live API. These are
// where the regressions that reached production actually were, so they matter
// more than the public pages, not less.
//
// Nine of these were missing until now, and every one of them had something:
// two icon-only buttons that read as "button, button" either side of a date,
// four search fields whose only name was a placeholder that disappears when
// you type, a switch that announced as "switch, on" with no mention of what it
// governs, and two empty-state headings that skipped h1 to h3. None of it is
// visible in a screenshot, which is exactly why a page nothing renders
// accumulates it.
const SIGNED_IN_PAGES = (
  process.env.AUDIT_SIGNED_IN_PAGES ??
  "/dashboard,/profile,/resources,/catalog,/settings,/plans,/admin," +
    "/schedule,/classes,/goals,/forum,/messages,/activities,/lists,/people,/canvases,/canvases/12,/classes/31,/classes/31?tab=notes,/classes/31?tab=forum,/classes/31?tab=canvas,/classes/31?tab=assignments,/classes/31?tab=designer,/classes/31?tab=activities,/classes/31?tab=resources,/lists/44,/profile/2,/guide,/tutorial," +
    // The detail page. It rendered its error boundary until the workflow
    // fixture existed and `workflow?.steps?.[key]` guarded both levels, which
    // is why the page carrying this product's headline feature had never been
    // rendered by anything.
    "/resources/101"
)
  .split(",")
  .filter(Boolean);

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
const server = serveBuild(ROOT, PORT);

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

/**
 * Runs in the page: em and en dashes in copy a user actually reads.
 *
 * They arrive by copy-paste from a document and by habit, they read as
 * machine-written, and one had already reached a live Google result for this
 * site. A grep over source cannot tell body copy from a code comment or a URL;
 * reading the rendered text can.
 *
 * Ranges are the legitimate use, so a closed-up dash is left alone.
 *
 * The reach is what the audit renders, and no more. Copy that only appears in
 * a state these renders do not reach - a verdict label for one classification,
 * a branch behind a filter - is not covered, and reintroducing a dash there
 * will not fail this. Treat it as a net under the paths users actually walk,
 * not as proof the product contains none.
 */
const DASHES = `(() => {
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','SVG']);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const out = [];
  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    if (skip.has(node.parentElement?.tagName)) continue;
    const el = node.parentElement;
    if (!el) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    /*
     * The line the dash is on, not the text node it lives in.
     *
     * JSX splits a rendered range into three text nodes -- the start, the
     * dash, the end -- so the
     * dash arrives here alone with no characters either side of it -- and a
     * rule that excuses a closed-up range cannot see that this is one.
     * "17:00\u201318:00" on the schedule was reported as prose the first time
     * anything rendered a study session. Reading the parent's text puts the
     * range back together. Concatenating can only close a dash up, never
     * space one out, so a genuine prose dash still reads as prose.
     */
    const text = el.textContent || '';
    // Ranges are the legitimate use, and they are written closed up: A\u2013Z,
    // 1\u201310, Mon\u2013Fri. Prose dashes are spaced. Keying on the spacing rather
    // than on token length matters: a length rule matches the last few
    // characters of ANY word, so "per seat \u2014 a licence" looked like the range
    // "at-a" and the real offender was silently excused.
    const prose = text.replace(/(\\w)[\u2013\u2014](\\w)/g, '$1-$2');
    if (!/[\u2013\u2014]/.test(prose)) continue;
    const around = prose.match(/.{0,34}[\u2013\u2014].{0,34}/);
    const snippet = (around ? around[0] : prose).replace(/\\s+/g, ' ').trim();
    if (seen.has(snippet)) continue;
    seen.add(snippet);
    out.push(snippet);
  }
  return out;
})()`;

/** Runs in the page: WCAG contrast for every leaf text element. */
const CONTRAST = `(() => {
  const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*r + 0.7152*g + 0.0722*b; };
  /*
   * Any CSS colour, as rgb and an alpha, by asking the browser.
   *
   * This used to be a regex for rgb() and rgba(). Tailwind v4 emits oklab()
   * for an opacity modifier, so a bg-card/90 class computes to
   * oklab(0.129 … / 0.9), which the regex did not match, so the walk
   * skipped that background entirely and kept going to whatever solid rgb()
   * was behind it. On the canvas editor that meant measuring white header text
   * against the light page underneath its own dark chip and reporting 1.08:1
   * on text that is perfectly readable.
   *
   * The dangerous half is the other one: the same blindness passes dark text
   * on a dark oklab surface by measuring it against a light ancestor.
   *
   * A 1x1 canvas does the conversion, which means every colour space the
   * browser supports works here without this file knowing any of them.
   */
  const readColour = (() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    return (value) => {
      if (!value) return null;
      ctx.clearRect(0, 0, 1, 1);
      // A value the canvas cannot parse leaves fillStyle at what it was, so
      // it is set to a known colour first and a no-op is detectable.
      /*
       * A value the canvas cannot parse leaves fillStyle at whatever it was,
       * so it is tried against two different sentinels: if the browser
       * understood it, both attempts land on the same colour, and if it did
       * not, each keeps its own sentinel and they differ. No regex, which
       * matters because this whole block is injected as a string and a
       * backslash in it is one template-literal escape away from vanishing.
       */
      ctx.fillStyle = '#000000';
      ctx.fillStyle = value;
      const first = ctx.fillStyle;
      ctx.fillStyle = '#ffffff';
      ctx.fillStyle = value;
      if (first !== ctx.fillStyle) return null;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { rgb: [r, g, b], a: a / 255 };
    };
  })();
  const parse = (s) => readColour(s);
  /*
   * Every background the text could be sitting on, nearest first.
   *
   * A gradient has no backgroundColor, so walking for one skipped straight
   * past it to whatever solid colour was behind — which is a surface the
   * reader never sees. That is wrong in both directions: it reported white
   * hero text on a dark gradient as 1.07 against the page behind it, and it
   * passed dark text on a gradient tile by measuring it against the card
   * underneath.
   *
   * So a gradient contributes all of its colour stops, and the caller takes
   * the worst. Approximate on purpose — a stop is not the colour under any
   * particular letter — but it bounds the answer, which "the wrong element's
   * background" never did.
   */
  const stopsOf = (image) => {
    const found = [];
    // Same reason as parse(): a gradient stop can be any colour space.
    // Doubled backslashes: this block is injected as a template literal, so
    // a single one is consumed before the browser ever sees the pattern.
    for (const m of image.matchAll(/(?:rgba?|oklab|oklch|hsla?|lab|lch|color)\\([^()]*(?:\\([^()]*\\)[^()]*)*\\)|#[0-9a-fA-F]{3,8}/g)) {
      const c = readColour(m[0]);
      if (!c || c.a <= 0.5) continue;
      found.push(c.rgb);
    }
    return found;
  };
  const bgsOf = (el) => { let n = el;
    while (n && n !== document.documentElement) {
      const st = getComputedStyle(n);
      const image = st.backgroundImage;
      if (image && image !== 'none' && image.includes('gradient')) {
        const stops = stopsOf(image);
        if (stops.length) return stops;
      }
      const c = parse(st.backgroundColor);
      if (c && c.a > 0.5) return [c.rgb]; n = n.parentElement; }
    const c = parse(getComputedStyle(document.body).backgroundColor); return [c ? c.rgb : [255,255,255]]; };
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
    const L1 = lum(fg.rgb);
    // The worst stop, not the average: a gradient is legible only where it is
    // hardest to read.
    const ratio = Math.min(...bgsOf(el).map((bg) => {
      const L2 = lum(bg);
      return (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
    }));
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

/**
 * The guide lives in AppShell's nested scroll container, so generic document
 * checks cannot see whether a contents link jumps or overshoots its final
 * section. Capture the actual scroll request made by React and also verify the
 * desktop sidebar stretches to the bottom of the viewport.
 */
async function auditGuideNavigation(page, pathname, width, signedIn) {
  if (pathname !== "/guide" || width < 1024 || !signedIn) return null;

  return page.evaluate(async () => {
    const scroller = document.querySelector("main");
    const sidebar = document.querySelector("aside.app-nav-surface");
    const link = document.querySelector(
      'nav[aria-label="Guide contents"] a[href="#admin"]',
    );
    if (!(scroller instanceof HTMLElement) || !(link instanceof HTMLElement)) {
      return {
        hashUpdated: false,
        smoothRequested: false,
        destinationBounded: false,
        sidebarCoversViewport: false,
      };
    }

    const calls = [];
    const nativeScrollTo = scroller.scrollTo.bind(scroller);
    scroller.scrollTo = (...args) => {
      const options = args[0];
      if (typeof options === "object" && options) calls.push(options);
      nativeScrollTo(...args);
    };

    scroller.scrollTop = 0;
    link.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const requested = calls.at(-1);
    const maximumTop = Math.max(
      0,
      scroller.scrollHeight - scroller.clientHeight,
    );
    const sidebarBox = sidebar?.getBoundingClientRect();
    return {
      hashUpdated: window.location.hash === "#admin",
      smoothRequested: requested?.behavior === "smooth",
      destinationBounded:
        Number.isFinite(requested?.top) &&
        requested.top >= 0 &&
        requested.top <= maximumTop,
      sidebarCoversViewport:
        Boolean(sidebarBox) &&
        sidebarBox.top <= 0 &&
        sidebarBox.bottom >= window.innerHeight,
    };
  });
}

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

  const guideNavigation = await auditGuideNavigation(
    page,
    pathname,
    width,
    signedIn,
  );

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
  // A public privacy route is not discoverable if the homepage never links to
  // it. Check the rendered footer, not just the router, because that missing
  // connection is what prevented visitors from opening the policy.
  const missingHomePrivacyLink =
    pathname === "/" && !signedIn
      ? await page.evaluate(() => {
          const link = document.querySelector('footer a[href="/privacy"]');
          if (!(link instanceof HTMLElement)) return true;
          const box = link.getBoundingClientRect();
          const style = getComputedStyle(link);
          return (
            box.width < 2 ||
            box.height < 2 ||
            style.visibility === "hidden" ||
            style.display === "none"
          );
        })
      : false;
  // The product plan includes a free-mobile sponsored placement. The privacy
  // page once made the opposite absolute promise ("no advertising SDKs"), so
  // verify the rendered policy names both processors and the privacy mode.
  // This is intentionally a content invariant rather than a source grep: store
  // reviewers and users only benefit if the disclosure reaches the live page.
  const missingPrivacyAdvertisingDisclosure =
    pathname === "/privacy" && !signedIn
      ? await page.evaluate(() => {
          const copy = document.body.textContent?.replace(/\s+/g, " ") ?? "";
          return ![
            "Google AdMob",
            "RevenueCat Ads",
            "non-personalized ads",
            "Paid plans are ad-free",
            "sponsored placement",
          ].every((required) => copy.includes(required));
        })
      : false;
  const findings = {
    lowContrast: await page.evaluate(CONTRAST),
    dashes: await page.evaluate(DASHES),
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
    guideNavigation,
    missingHomePrivacyLink,
    missingPrivacyAdvertisingDisclosure,
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
            dashes: [],
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
            guideNavigation: null,
            missingHomePrivacyLink: false,
            missingPrivacyAdvertisingDisclosure: false,
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

/**
 * Signed-in sweep: which saved palette, and which colorScheme to render it under.
 *
 * Two realistic palettes were not enough. Both happen to pick a brand colour
 * dark enough that the navigation's inherited --primary-foreground came out
 * white by luck, so a light brand pick - which resolves it to near-black on the
 * sidebar's near-black surface, about 1.09:1 - rendered invisible text and the
 * audit stayed green. brandLight and brandDark push the brand to each end of
 * the lightness axis while holding each canvas polarity.
 *
 * The second element is deliberately separate from the first: Playwright's
 * colorScheme is a strict enum (dark|light|no-preference|no-override) and
 * rejects a palette name outright, throwing before any page is rendered.
 */
const SIGNED_IN_SWEEP = [
  ["dark", "dark"],
  ["light", "light"],
  ["brandLight", "light"],
  ["brandDark", "dark"],
];

/*
 * Every render this run will do, listed before any of it happens.
 *
 * Each is its own browser context, so the loops that used to await one render
 * at a time were describing the sweep rather than requiring an order. The
 * report below reads `results` in this list's order, so what it prints does
 * not depend on which render finished first.
 */
const RENDERS = [];
for (const pathname of PAGES) {
  for (const scheme of ["dark", "light"]) {
    RENDERS.push([pathname, scheme, 1280, {}]);
  }
  RENDERS.push([pathname, "dark", 390, {}]);
}
for (const pathname of SIGNED_IN_PAGES) {
  for (const [palette, colorScheme] of SIGNED_IN_SWEEP) {
    RENDERS.push([pathname, colorScheme, 1280, { signedIn: true, palette }]);
  }
  RENDERS.push([pathname, "dark", 390, { signedIn: true, palette: "dark" }]);
}

const results = await inParallel(
  RENDERS,
  ([pathname, scheme, width, options]) =>
    auditGuarded(pathname, scheme, width, options),
);

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
    ...(findings.dashes ?? []).map((t) => `em or en dash in copy: "${t}"`),
    ...findings.pageErrors.map((e) => `page error: ${e}`),
    ...(findings.guideNavigation && !findings.guideNavigation.hashUpdated
      ? ["guide contents link did not update the section hash"]
      : []),
    ...(findings.guideNavigation && !findings.guideNavigation.smoothRequested
      ? ["guide contents link did not request smooth scrolling"]
      : []),
    ...(findings.guideNavigation && !findings.guideNavigation.destinationBounded
      ? ["guide contents link requested a scroll beyond the page end"]
      : []),
    ...(findings.guideNavigation &&
    !findings.guideNavigation.sidebarCoversViewport
      ? ["desktop sidebar does not cover the full viewport height"]
      : []),
    ...(findings.missingHomePrivacyLink
      ? ["homepage footer has no visible Privacy Policy link"]
      : []),
    ...(findings.missingPrivacyAdvertisingDisclosure
      ? ["privacy policy is missing the mobile advertising disclosure"]
      : []),
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

/*
 * An endpoint the harness cannot answer is an endpoint no audit can check.
 *
 * This was a note, and a note is what nothing acts on. An unmapped endpoint is
 * answered `200 []`, which is a deliberate choice -- most of them are
 * collections and most components tolerate an empty one -- and it means the
 * panel that reads it renders a shape the contract never produces. One of them
 * put a page into its error boundary for a whole audit run, and the run said
 * "clean" underneath a line nobody had read.
 *
 * So it fails now. The fix is one line in audit-fixtures.mjs, and writing it
 * is what makes the page's panel checkable at all.
 */
if (unfixtured.size) {
  failed += 1;
  console.log(
    `\nFAIL no fixture for ${[...unfixtured].sort().join(", ")}` +
      ". Answered empty, so whatever reads it was not checked. Add it to " +
      "scripts/audit-fixtures.mjs.",
  );
}

console.log(
  failed === 0
    ? `\nAll ${results.length} page renders clean.`
    : `\n${failed} problem(s) across ${results.length} page renders.`,
);
process.exit(failed === 0 ? 0 : 1);
