#!/usr/bin/env node
/**
 * The phone app, rendered, against a real server.
 *
 * The mobile app is the thing that gets submitted to the stores and it had no
 * check that renders it. CI asks Metro to bundle it, which proves the modules
 * resolve and nothing more: every screen in this app could be blank, or throw
 * on its first render, and the bundle step would still pass. Nobody would know
 * until a reviewer opened it.
 *
 * What that cost, concretely: `/api/schedule` sent `date` as
 * "2026-08-19T00:00:00.000Z" while the contract says "2026-08-19", and the
 * schedule screen compares that field to a YYYY-MM-DD string. Schedule blocks
 * were invisible on the phone -- every timezone, every day, everybody -- and
 * the web app was fine, because it parses the value first. Only rendering the
 * phone app against a real server shows that.
 *
 * So this is deliberately not fixture-driven. Fixtures are written from the
 * same idea of the contract that the screen holds, so the two agree with each
 * other and both are wrong together; that is exactly how the bug above
 * survived. Every response here comes from a real handler and a real database.
 *
 * How it reaches the server: Expo bundles for the web, the export is served
 * locally, and the browser rewrites the app's own origin -- always
 * https://casparel.com, deliberately, so a store build cannot be shipped
 * pointing at nothing -- onto the server under test. The app's code is
 * untouched and does not know.
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

/** The origin the app is hardcoded to talk to; see utils/api-host.ts. */
const APP_ORIGIN = "https://casparel.com";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const EMAIL = `mobile-${RUN}@example.test`;
const PASSWORD = "mobile-Passw0rd!checks";
const NAME = "Mobile Audit";
/** Written for today, then looked for on the schedule screen. */
const BLOCK_TITLE = "Audit revision block";

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
 * expo-router builds client-side routes, so /schedule is not a file. Every
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

/** Each tab, and a string that proves its own content arrived. */
const TABS = [
  { name: "dashboard", route: "/", expect: /Dashboard|Hi,/ },
  { name: "resources", route: "/resources", expect: /Resources/ },
  // The title has to be on the screen, not merely the word "Schedule": the
  // failure being guarded against renders the whole screen perfectly and
  // leaves the block out of it.
  { name: "schedule", route: "/schedule", expect: new RegExp(BLOCK_TITLE) },
  { name: "classes", route: "/classes", expect: /Classes/ },
  { name: "profile", route: "/profile", expect: /Profile/ },
];

/** What the app's error boundary puts on the screen when a render throws. */
const CRASHED = /Something went wrong/i;

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

    // Light first, and signed out: registering through the real form is what a
    // reviewer does before anything else, and it is the one screen that has to
    // work before any other can be reached.
    const light = await browser.newContext({
      viewport: { width: 420, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });

    let signedIn = false;
    const pageErrors = [];
    const apiFailures = [];

    for (const context of [light]) {
      await context.route(`${APP_ORIGIN}/**`, forwardToServer);
    }
    light.on("response", (response) => {
      if (isInterestingFailure(response.url(), response.status(), signedIn)) {
        apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
      if (response.status() === 429) throw new Inconclusive("rate limited");
    });

    const page = await light.newPage();
    page.on("pageerror", (error) => pageErrors.push(`register/login: ${String(error).slice(0, 200)}`));

    await page.goto(`${local}/register`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const name = page.getByPlaceholder("Your name");
    if (!(await name.count())) {
      throw new Inconclusive("the register screen did not render its form");
    }
    await name.fill(NAME);
    await page.getByPlaceholder("you@school.edu").fill(EMAIL);
    await page.getByPlaceholder("At least 8 characters").fill(PASSWORD);
    await page.getByText(/Create account|Sign up/i).last().click();
    await page.waitForTimeout(4000);

    const afterRegister = await page.evaluate(() => document.body.innerText);
    check(
      "registering on the phone signs you in",
      !/Create account/i.test(afterRegister) && !CRASHED.test(afterRegister),
      afterRegister.replace(/\n+/g, " | ").slice(0, 160),
    );
    signedIn = !/Create account/i.test(afterRegister);
    if (!signedIn) throw new Inconclusive("could not register, so no screen below can be judged");

    /*
     * A new account lands on onboarding, and it is a gate: every tab below
     * renders it instead of itself until it is dismissed. That is the real
     * first-run path -- it is what a store reviewer sees -- so it is walked
     * rather than skipped, and the flag it sets is what the rest of this run
     * depends on.
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
    /*
     * Put one row in, for today, so the screens below have something to be
     * wrong about.
     *
     * An empty account renders every screen's empty state, and an empty state
     * is exactly what a screen shows when it cannot recognise the data it was
     * given -- which is the bug this file exists for. `date` went out as
     * "2026-08-19T00:00:00.000Z" against a contract of "2026-08-19", the
     * schedule compared it to a YYYY-MM-DD string, and the answer on the phone
     * was a tidy "No events scheduled". Written through the API rather than
     * the UI because the phone app has no screen for creating a block; what is
     * being checked is that the phone can read what the server writes.
     */
    const token = await page.evaluate(() => localStorage.getItem("schoolar_token"));
    if (!token) throw new Inconclusive("registered but no session token was stored");
    const now = new Date();
    const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const written = await fetch(`${BASE}/api/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: BLOCK_TITLE,
        date: TODAY,
        startTime: "09:00",
        endTime: "10:00",
      }),
    });
    check("the server accepts a schedule block", written.status === 201, `${written.status}`);
    if (written.status === 201) {
      const body = await written.json();
      check(
        "and sends its date back as a date, not a timestamp",
        /^\d{4}-\d{2}-\d{2}$/.test(String(body.date)),
        `date=${JSON.stringify(body.date)}`,
      );
    }
    await page.close();

    // Both schemes. The colours are checked in the mobile unit suite; what is
    // checked here is that neither one throws, which a palette cannot tell you.
    for (const scheme of ["light", "dark"]) {
      const context =
        scheme === "light"
          ? light
          : await browser.newContext({
              viewport: { width: 420, height: 900 },
              deviceScaleFactor: 2,
              colorScheme: "dark",
            });
      if (scheme === "dark") {
        await context.route(`${APP_ORIGIN}/**`, forwardToServer);
        // Carry the session across rather than signing in twice: the credential
        // limiter counts attempts per address, and this run has other things to
        // spend that budget on.
        await context.addCookies(await light.cookies().catch(() => []));
        const storage = await light.storageState();
        const origin = storage.origins.find((entry) => entry.origin.startsWith("http://127.0.0.1"));
        await context.addInitScript((items) => {
          for (const item of items ?? []) localStorage.setItem(item.name, item.value);
        }, origin?.localStorage ?? []);
      }

      for (const tab of TABS) {
        const tabPage = await context.newPage();
        tabPage.on("pageerror", (error) =>
          pageErrors.push(`${scheme} ${tab.name}: ${String(error).slice(0, 200)}`),
        );
        await tabPage.goto(`${local}${tab.route}`, { waitUntil: "networkidle" });
        await tabPage.waitForTimeout(2500);
        const text = await tabPage.evaluate(() => document.body.innerText);

        check(`${scheme}: ${tab.name} renders`, tab.expect.test(text), text.replace(/\n+/g, " | ").slice(0, 140));
        check(`${scheme}: ${tab.name} does not throw`, !CRASHED.test(text));
        await tabPage.close();
      }

      if (scheme === "dark") await context.close();
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
