#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Audit Screens behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The phone app, rendered, against a real server.
 *
 * The mobile app is the thing that gets submitted to the stores and it had no
 * check that renders it. CI asks Metro to bundle it, which proves the modules
 * resolve and nothing more: every screen in this app could be blank, or throw
 * on its first render, and the bundle step would still pass. Nobody would know
 * until a reviewer opened it.
 *
 * What it covers is the way in, which is all this app still draws for itself:
 * a refused sign-in, registration, the onboarding gate, the hand-off to the
 * workspace, and the paywall. A signed-in session is the website in a WebView
 * now -- the native tabs and their screens were deleted once nothing could
 * reach them -- and a WebView renders nothing in a web export, so there is no
 * signed-in screen here left to walk. That half is audited where it lives:
 * audit-pages.mjs and audit-translation.mjs render the real website.
 *
 * This file used to walk fourteen of those deleted screens, and for a while it
 * walked none of them without saying so. The register screen grew a terms
 * checkbox, this kept filling the form and clicking a disabled button, and the
 * run ended "Inconclusive" -- exit 75, which CI reports as a warning and a
 * green step. It was green for days while judging nothing at all. The
 * checkbox is ticked below, and the shape of that failure is worth
 * remembering: an audit that cannot run has to be louder than one that fails.
 *
 * Every response here comes from a real handler and a real database. How it
 * reaches the server: Expo bundles for the web, the export is served locally,
 * and the browser rewrites the app's own origin -- always https://casparel.com,
 * deliberately, so a store build cannot be shipped pointing at nothing -- onto
 * the server under test. The app's code is untouched and does not know.
 *
 *   node artifacts/mobile/scripts/audit-screens.mjs [baseUrl]
 *
 * Needs a web export; make one with
 *   pnpm --filter @workspace/mobile exec expo export --platform web \
 *     --output-dir .expo/web-export
 *
 * Exit 0 all good, 1 something is broken, 75 the run could not be performed.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchOptions } from "../../app/scripts/chromium.mjs";

const BASE = (process.argv[2] || "http://localhost:4319").replace(/\/$/, "");
const EXIT_INCONCLUSIVE = 75;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = process.env.MOBILE_WEB_EXPORT || path.join(HERE, "..", ".expo", "web-export");
/** Set MOBILE_AUDIT_SHOTS to a directory to keep a picture of every screen. */
const SHOTS = process.env.MOBILE_AUDIT_SHOTS || null;

/** The origin the app is hardcoded to talk to; see utils/api-host.ts. */
const APP_ORIGIN = "https://casparel.com";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const EMAIL = `mobile-${RUN}@example.test`;
const PASSWORD = "mobile-Passw0rd!checks";
const NAME = "Mobile Audit";

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) console.log(`ok   ${label}${detail ? `  ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL ${label}\n     ${detail || "expected true"}`);
  }
}

class Inconclusive extends Error {}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

/**
 * Serve the export, falling back to index.html.
 *
 * expo-router builds client-side routes, so /paywall is not a file. Every
 * unknown path has to return the shell or the route never gets a chance to
 * run -- which looks exactly like a blank screen.
 */
function serveExport(dir) {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.join(dir, requested);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, "index.html");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/**
 * Point the app's requests at the server under test.
 *
 * The whole body has to be carried across: dropping the POST payload turns
 * every write into a validation failure that reads like a product bug, which
 * cost an afternoon the first time it happened in the web audit.
 */
async function forwardToServer(route) {
  const request = route.request();
  const target = BASE + new URL(request.url()).pathname + (new URL(request.url()).search || "");
  const init = { method: request.method(), headers: request.headers(), redirect: "manual" };
  const body = request.postData();
  if (body !== null && request.method() !== "GET" && request.method() !== "HEAD") init.body = body;

  let response;
  try {
    response = await fetch(target, init);
  } catch (error) {
    return route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: `could not reach ${target}: ${String(error)}` }),
    });
  }
  const text = await response.text();
  return route.fulfill({
    status: response.status,
    contentType: response.headers.get("content-type") ?? "application/json",
    body: text,
  });
}

/**
 * Find playwright-core wherever it was put.
 *
 * It is deliberately not a dependency of any package here -- it is a tool, not
 * something a bundle needs -- so CI installs it out of tree and links it into
 * artifacts/app. Looking there second means this script needs no second link,
 * and a missing browser stays inconclusive rather than reading as a product
 * failure.
 */
async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    const beside = path.join(HERE, "..", "..", "app", "node_modules", "playwright-core");
    if (!fs.existsSync(beside)) throw new Inconclusive("playwright-core is not installed");
    // Imported by path it arrives as CommonJS, so the named exports sit on
    // `default` rather than on the namespace.
    const loaded = await import(new URL(`file://${beside}/index.js`).href);
    return loaded.chromium ? loaded : loaded.default;
  }
}

/** Requests the signed-in app made for itself that came back an error. */
function isInterestingFailure(url, status, signedIn) {
  if (status < 400) return false;
  if (!url.includes("/api/")) return false;
  if (!signedIn && status === 401) return false;
  // The app asks whether optional integrations are configured; "no" is an
  // answer, not a fault.
  if (/\/api\/(calendar|integrations)\//.test(url) && status === 404) return false;
  // A rate limit is the server working. It makes the run inconclusive, which
  // is handled separately, rather than a failure.
  if (status === 429) return false;
  return true;
}

/** What the app's error boundary puts on the screen when a render throws. */
const CRASHED = /Something went wrong/i;

async function shoot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function main() {
  if (!fs.existsSync(path.join(EXPORT_DIR, "index.html"))) {
    throw new Inconclusive(
      `no web export at ${EXPORT_DIR}. Build one with:\n` +
        `  pnpm --filter @workspace/mobile exec expo export --platform web --output-dir .expo/web-export`,
    );
  }

  let health;
  try {
    health = await fetch(`${BASE}/api/healthz`);
  } catch (error) {
    throw new Inconclusive(`no server at ${BASE}: ${String(error)}`);
  }
  if (!health.ok) throw new Inconclusive(`${BASE}/api/healthz answered ${health.status}`);

  const { chromium } = await loadPlaywright();
  const server = await serveExport(EXPORT_DIR);
  const local = `http://127.0.0.1:${server.address().port}`;
  let browser;

  try {
    browser = await chromium.launch(launchOptions());

    // Signed out, on a phone-sized screen: registering through the real form
    // is what a reviewer does before anything else, and it is the one screen
    // that has to work before any other can be reached.
    const light = await browser.newContext({
      viewport: { width: 420, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });

    let signedIn = false;
    const pageErrors = [];
    const apiFailures = [];

    await light.route(`${APP_ORIGIN}/**`, forwardToServer);
    light.on("response", (response) => {
      if (isInterestingFailure(response.url(), response.status(), signedIn)) {
        apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
      if (response.status() === 429) throw new Inconclusive("rate limited");
    });

    const page = await light.newPage();
    page.on("pageerror", (error) => pageErrors.push(`${String(error).slice(0, 200)}`));

    /*
     * A wrong password first, on the real screen.
     *
     * The sign-in screen used to ignore the error entirely and say "Invalid
     * email or password" whatever happened -- to a rate limit, to a dropped
     * connection, to a server error. describeAuthFailure fixed that, and
     * nothing had ever rendered it: it is a pure module with unit tests, and
     * the screen that uses it is a React component that was only ever read.
     *
     * One attempt. The credential limiter counts per address, and this run
     * has a registration and a sign-in to spend that budget on.
     */
    await page.goto(`${local}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    if (await page.getByPlaceholder("you@school.edu").count()) {
      await page.getByPlaceholder("you@school.edu").fill(`nobody-${RUN}@example.test`);
      await page.getByPlaceholder("••••••••").fill("definitely-not-the-password");
      await page.getByText("Sign in", { exact: true }).last().click();
      await page.waitForTimeout(3000);
      const said = await page.evaluate(() => document.body.innerText);
      check(
        "a wrong password is refused in words, not a status line",
        /invalid email or password/i.test(said) && !/HTTP \d/.test(said),
        said.replace(/\n+/g, " | ").slice(0, 160),
      );
    }
    await shoot(page, "1-login");

    await page.goto(`${local}/register`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const name = page.getByPlaceholder("Your name");
    if (!(await name.count())) {
      throw new Inconclusive("the register screen did not render its form");
    }
    await name.fill(NAME);
    await page.getByPlaceholder("you@school.edu").fill(EMAIL);
    await page.getByPlaceholder("At least 8 characters").fill(PASSWORD);

    /*
     * The terms box, which is a gate and not a nicety.
     *
     * "Create account" is `disabled={!acceptedTerms}`, so a run that fills the
     * form and clicks anyway registers nobody, sees the form still on screen,
     * and reports that it could not get in. That is what this file did for
     * days. Consenting is also the thing being checked: the store answers say
     * a person agrees to the content rules before they can post anything, and
     * a checkbox nobody ever ticks is a promise nothing keeps.
     */
    const terms = page.getByRole("checkbox");
    if (!(await terms.count())) {
      throw new Inconclusive("the register screen has no terms checkbox to tick");
    }
    /*
     * Read the tick off the icon's colour, which is the only place it shows.
     *
     * React Native Web renders this Pressable as a div and drops
     * accessibilityState on the floor: aria-checked is absent whether or not
     * the box is ticked, so asserting on it passes either way -- which is how
     * the first version of this check managed to be as empty as the run it was
     * meant to fix. The icon swaps muted for primary (see register.tsx), and
     * comparing the computed colour to itself needs no literal from the theme.
     */
    const tickColour = () =>
      page
        .getByRole("checkbox")
        .first()
        .evaluate((el) => getComputedStyle(el.firstElementChild ?? el).color);
    const untickedColour = await tickColour();
    await terms.first().click();
    await page.waitForTimeout(400);
    const tickedColour = await tickColour();
    check(
      "the terms box takes the tick that unlocks the button",
      untickedColour !== tickedColour,
      `${untickedColour} -> ${tickedColour}`,
    );

    await page.getByText(/Create account|Sign up/i).last().click();
    await page.waitForTimeout(4000);

    const afterRegister = await page.evaluate(() => document.body.innerText);
    check(
      "registering on the phone signs you in",
      !/Create account/i.test(afterRegister) && !CRASHED.test(afterRegister),
      afterRegister.replace(/\n+/g, " | ").slice(0, 160),
    );
    signedIn = !/Create account/i.test(afterRegister);
    /*
     * A sign-up that does not work is a broken product, not a run that could
     * not be performed, and the difference decides whether anyone hears about
     * it: "inconclusive" is exit 75, which this workflow turns into a warning
     * and a green step. That is how a disabled button went unnoticed for days.
     * So the checks below are skipped and the run still ends in failure.
     */
    if (signedIn) {
      await shoot(page, "2-registered");

      /*
       * A new account lands on onboarding, and it is a gate: everything behind
       * it renders it instead of itself until it is dismissed. That is the real
       * first-run path -- it is what a store reviewer sees.
       */
      const started = page.getByText("Get started").last();
      if (await started.count()) {
        await started.click();
        await page.waitForTimeout(2500);
      }
      const afterOnboarding = await page.evaluate(() => document.body.innerText);
      check(
        "onboarding lets you out of it",
        !/Welcome to Casparel/i.test(afterOnboarding),
        afterOnboarding.replace(/\n+/g, " | ").slice(0, 160),
      );
      await shoot(page, "3-onboarded");

      const token = await page.evaluate(() => localStorage.getItem("schoolar_token"));
      check("the session it just created is stored", Boolean(token), token ? "" : "no schoolar_token");

      /*
       * Where a signed-in session ends up, which is the whole shape of this app
       * now: resolveInitialRoute sends anything that is not the paywall to
       * /mobile, and /mobile is the website in a WebView.
       *
       * The route is what gets asserted, not what is on it. react-native-webview
       * has no web implementation, so in this export /mobile renders the
       * library's own "does not support this platform" -- checking for that
       * string would be checking a dependency's placeholder. What matters here
       * is that the app decided to go there and did not fall out of the product
       * onto a public page or a dead native route.
       */
      check(
        "a signed-in session lands on the workspace",
        new URL(page.url()).pathname === "/mobile",
        new URL(page.url()).pathname,
      );

      /*
       * The paywall, which is the one signed-in screen this app still draws
       * itself. It renders before any store connection exists, which is the
       * state CI is always in, so what is checked is that it says something
       * rather than throwing.
       */
      await page.goto(`${local}/paywall`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);
      const plans = await page.evaluate(() => document.body.innerText);
      check(
        "the paywall names the plans",
        /Plus/.test(plans) && /Pro/.test(plans) && !CRASHED.test(plans),
        plans.replace(/\n+/g, " | ").slice(0, 160),
      );
      await shoot(page, "4-paywall");

    } else {
      console.log("     nothing below could be judged, because registering did not work");
    }

    check("no screen threw an uncaught exception", pageErrors.length === 0, pageErrors.slice(0, 4).join("\n     "));
    check(
      "no request the app makes for itself came back an error",
      apiFailures.length === 0,
      [...new Set(apiFailures)].slice(0, 6).join(", "),
    );

    await light.close();
  } finally {
    await browser?.close().catch(() => {});
    server.close();
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (error instanceof Inconclusive) {
      console.log(`\nInconclusive: ${error.message}`);
      process.exit(EXIT_INCONCLUSIVE);
    }
    console.error(error);
    process.exit(1);
  });
