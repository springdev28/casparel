#!/usr/bin/env node
/**
 * @fileOverview Mobile support role: configures or implements Store Screenshots for the Expo application.
 * System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.
 */
/**
 * The store screenshots, taken from the app rather than drawn.
 *
 * Both stores and the Shipaton submission want 1179×2556 with no device
 * frame, which is a 6.9" iPhone: 393×852 CSS pixels at 3×. That is a size,
 * not a mockup, so these are renders of the real app talking to a real server
 * — every number on them is a row somebody's account actually holds.
 *
 * The account is seeded here rather than by hand because a screenshot of an
 * empty product sells nothing and a screenshot of invented content is a claim
 * the app has to live up to. Everything below is something the app can do
 * today: a week with study on it, a library with real open-education
 * material, a class with members, and the plans screen.
 *
 * A store screenshot is a promise. If a panel here looks better than the
 * shipped app does, that is a bug in this file, not a feature of it.
 *
 * WHAT THESE ARE NOT: a screenshot of the native binary. This renders the web
 * export, and the app deliberately adds 67px of padding on web that a phone
 * does not have (`webTopPad`), while a phone adds a safe-area inset that the
 * web does not. So the top of every frame here is a few dozen pixels off what
 * an iPhone draws, and the status bar is missing entirely.
 *
 * That makes them right for composing the submission, for reading the copy at
 * real size, and for catching a screen that looks wrong before the build
 * queue does. It does not make them right to upload. The final store assets
 * have to come from a device or simulator running the actual build, which is
 * also what the review guidelines mean by a screenshot of the app.
 *
 * One set per language, because the App Store takes screenshots per
 * localization and a Spanish listing showing English screenshots is a listing
 * that looks machine-made. Six languages by five screens by two colour schemes
 * is sixty frames, which is more than any one listing needs -- pick the scheme
 * that suits the listing and use the language's own set.
 *
 *   node artifacts/mobile/scripts/store-screenshots.mjs [baseUrl] [outDir]
 *   STORE_LANGS=en,es node artifacts/mobile/scripts/store-screenshots.mjs
 *
 * Needs a web export (see audit-screens.mjs) and a running server. Defaults to
 * http://localhost:4319 and artifacts/mobile/.expo/store-screenshots.
 *
 * Exit 0 all written, 75 the run could not be performed.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchOptions } from "../../app/scripts/chromium.mjs";

const BASE = (process.argv[2] || "http://localhost:4319").replace(/\/$/, "");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[3] || path.join(HERE, "..", ".expo", "store-screenshots");
const EXPORT_DIR = process.env.MOBILE_WEB_EXPORT || path.join(HERE, "..", ".expo", "web-export");
const EXIT_INCONCLUSIVE = 75;

/** 6.9" iPhone: 393×852 at 3× is exactly 1179×2556. */
const VIEWPORT = { width: 393, height: 852 };
const SCALE = 3;

const APP_ORIGIN = "https://casparel.com";
/**
 * The languages to shoot. All six by default; narrow it while iterating,
 * because sixty frames at 3× take a while and most of that is font settling.
 */
const LANGUAGES = (process.env.STORE_LANGS ?? "en,tr").split(",");
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const EMAIL = `store-${RUN}@example.test`;
const PASSWORD = "store-Passw0rd!shots";

class Inconclusive extends Error {}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

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

async function api(method, route, { token, body } = {}) {
  const response = await fetch(BASE + route, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, body: parsed, text };
}

async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    const beside = path.join(HERE, "..", "..", "app", "node_modules", "playwright-core");
    if (!fs.existsSync(beside)) throw new Inconclusive("playwright-core is not installed");
    const loaded = await import(new URL(`file://${beside}/index.js`).href);
    return loaded.chromium ? loaded : loaded.default;
  }
}

/** A day this week, so the schedule never shows an empty grid. */
function dayOfThisWeek(offset) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

/**
 * Real open-education material, with its real address.
 *
 * Not invented titles: these are things the catalogue genuinely points at, so
 * the screenshot shows what somebody would actually find.
 */
const RESOURCES = [
  {
    title: "Calculus Made Easy",
    url: "https://www.gutenberg.org/ebooks/33283",
    description: "Silvanus Thompson's classic gentle introduction to the calculus.",
    format: "article",
    subject: "Mathematics",
    gradeLevel: "Year 12",
  },
  {
    title: "A Short History of Astronomy",
    url: "https://openlibrary.org/works/OL15168W",
    description: "Arthur Berry's survey, from antiquity to the nineteenth century.",
    format: "article",
    subject: "Physics",
    gradeLevel: "Year 12",
  },
  {
    title: "On the Origin of Species",
    url: "https://www.gutenberg.org/ebooks/1228",
    description: "The first edition, in full.",
    format: "article",
    subject: "Biology",
    gradeLevel: "Year 13",
  },
];

const BLOCKS = [
  { title: "Integration by parts", date: dayOfThisWeek(0), startTime: "09:00", endTime: "10:30", notes: "Past paper Q4–Q7" },
  { title: "Physics: waves recap", date: dayOfThisWeek(0), startTime: "14:00", endTime: "15:00" },
  { title: "Essay plan: natural selection", date: dayOfThisWeek(0), startTime: "19:00", endTime: "20:00", notes: "Outline only" },
  { title: "Biology reading", date: dayOfThisWeek(1), startTime: "11:00", endTime: "12:00" },
];

async function main() {
  if (!fs.existsSync(path.join(EXPORT_DIR, "index.html"))) {
    throw new Inconclusive(
      `no web export at ${EXPORT_DIR}. Build one with:\n` +
        `  pnpm --filter @workspace/mobile exec expo export --platform web --output-dir .expo/web-export`,
    );
  }
  try {
    const health = await fetch(`${BASE}/api/healthz`);
    if (!health.ok) throw new Inconclusive(`${BASE}/api/healthz answered ${health.status}`);
  } catch (error) {
    if (error instanceof Inconclusive) throw error;
    throw new Inconclusive(`no server at ${BASE}: ${String(error)}`);
  }

  const registered = await api("POST", "/api/auth/register", {
    body: { email: EMAIL, password: PASSWORD, name: "Bahar Yüksel" },
  });
  const token = registered.body?.token;
  if (!token) throw new Inconclusive(`could not register (HTTP ${registered.status})`);

  for (const block of BLOCKS) await api("POST", "/api/schedule", { token, body: block });
  const added = [];
  for (const resource of RESOURCES) {
    const created = await api("POST", "/api/resources", { token, body: resource });
    if (created.status === 201) added.push(created.body.id);
  }

  /*
   * A review, so the dashboard's Reviews tile is not a zero.
   *
   * Left out, every screenshot showed an account that had done nothing: 0
   * classes, 0 reviews, "No activity yet". That is a true picture of a
   * five-minute-old account and a poor picture of the product, and the fix is
   * to use the product rather than to fake the numbers.
   */
  if (added[0]) {
    await api("POST", `/api/resources/${added[0]}/reviews`, {
      token,
      body: { rating: 5, comment: "Clearest explanation of the chain rule I have read." },
    });
  }

  /*
   * A class, joined properly.
   *
   * Registration only creates students, so this needs an administrator to
   * promote a teacher. Without E2E_ADMIN_EMAIL the screenshots are still
   * taken, with the classes tile at zero, and the run says so rather than
   * quietly shipping a thinner picture.
   */
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  if (!adminEmail) {
    console.log(
      "note: no E2E_ADMIN_EMAIL, so no class is seeded and the Classes tile " +
        "will read 0. Set it to an address in the server's ADMIN_EMAILS.",
    );
  } else {
    const adminPassword = process.env.E2E_ADMIN_PASSWORD || "e2e-Admin-Passw0rd!shared";
    await api("POST", "/api/auth/register", {
      body: { email: adminEmail, password: adminPassword, name: "Casparel Admin" },
    });
    const adminIn = await api("POST", "/api/auth/login", {
      body: { email: adminEmail, password: adminPassword },
    });
    const teacherEmail = `store-teacher-${RUN}@example.test`;
    const teacher = await api("POST", "/api/auth/register", {
      body: { email: teacherEmail, password: PASSWORD, name: "Mr Okonkwo" },
    });
    const teacherId = teacher.body?.user?.id ?? teacher.body?.id;
    if (adminIn.body?.token && teacherId) {
      await api("PATCH", `/api/admin/users/${teacherId}`, {
        token: adminIn.body.token,
        body: { role: "teacher", activeRole: "teacher" },
      });
      const teacherIn = await api("POST", "/api/auth/login", {
        body: { email: teacherEmail, password: PASSWORD },
      });
      const cls = await api("POST", "/api/classes", {
        token: teacherIn.body?.token,
        body: { name: "Physics A-level", subject: "Physics", gradeLevel: "Year 12" },
      });
      if (cls.status === 201) {
        await api("POST", `/api/classes/${cls.body.id}/invitations`, {
          token: teacherIn.body?.token,
          body: { email: EMAIL },
        });
        const invitations = await api("GET", "/api/class-invitations", { token });
        const mine = (invitations.body ?? []).find((item) => item.classId === cls.body.id);
        if (mine) {
          await api("PATCH", `/api/class-invitations/${mine.id}`, {
            token,
            body: { action: "accept" },
          });
        }
      }
    }
  }

  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await serveExport(EXPORT_DIR);
  const local = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const written = [];

  try {
    browser = await chromium.launch(launchOptions());
    for (const language of LANGUAGES)
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: scheme,
      });
      await context.route(`${APP_ORIGIN}/**`, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const init = { method: request.method(), headers: request.headers() };
        const body = request.postData();
        if (body && request.method() !== "GET" && request.method() !== "HEAD") init.body = body;
        const response = await fetch(BASE + url.pathname + url.search, init);
        const text = await response.text();
        return route.fulfill({
          status: response.status,
          contentType: response.headers.get("content-type") ?? "application/json",
          body: text,
        });
      });
      await context.addInitScript(
        ([sessionToken, user, lang]) => {
          localStorage.setItem("schoolar_token", sessionToken);
          localStorage.setItem("casparel_user", user);
          localStorage.setItem("casparel_onboarded", "true");
          // Set on the device rather than on the account: the account
          // preference is only consulted when the phone has never been told,
          // so writing it here is what a person choosing a language does.
          localStorage.setItem("casparel_language", lang);
        },
        [token, JSON.stringify(registered.body?.user ?? {}), language],
      );

      /*
       * Only the screens this app still draws itself.
       *
       * The dashboard, schedule, resources and profile shots came from native
       * screens that no longer exist: a signed-in phone shows the website in a
       * WebView now, and a WebView renders nothing in this web export, so
       * there is no honest way to capture them from here. Those slots have to
       * be filled from a device or emulator running the real build, where the
       * WebView shows the actual product.
       */
      for (const [name, route] of [
        ["1-welcome", "/onboarding"],
        ["2-plans", "/paywall"],
      ]) {
        const page = await context.newPage();
        await page.goto(`${local}${route}`, { waitUntil: "networkidle" });
        // Fonts and the tab bar's blur both settle after the network does, and
        // a screenshot taken before they do ships a different app than the one
        // that runs.
        await page.waitForTimeout(3000);
        const file = path.join(OUT, language, `${name}-${scheme}.png`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await page.screenshot({ path: file });
        const { width, height } = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }));
        written.push(
          `${language}/${path.basename(file)}  ${width * SCALE}×${height * SCALE}`,
        );
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser?.close().catch(() => {});
    server.close();
  }

  console.log(`Wrote ${written.length} screenshots to ${OUT}:`);
  for (const line of written) console.log(`  ${line}`);
  console.log(
    "\nStore and Shipaton submissions want 1179×2556 with no device frame; " +
      "these are that size already.",
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (error instanceof Inconclusive) {
      console.log(`Inconclusive: ${error.message}`);
      process.exit(EXIT_INCONCLUSIVE);
    }
    console.error(error);
    process.exit(1);
  });
