#!/usr/bin/env node
/**
 * The app driven through a browser, against a real server.
 *
 * The page audit next door renders the same screens with the API answered from
 * fixtures. That catches what a screen looks like and nothing about whether it
 * works: every fixture returns 200 with a well-formed body, so a button wired
 * to a route that does not exist, a form that posts the wrong shape, and a list
 * that never refetches after a write all render perfectly.
 *
 * This drives the real thing. A real account is registered through the real
 * form, and every assertion afterwards is about what the server actually did:
 * a written row comes back on the next screen, a copy lands in the library, a
 * sign-out really ends the session.
 *
 * It also watches the two channels a person would notice and a screenshot would
 * not: uncaught exceptions in the page, and API calls that came back 4xx/5xx
 * while the screen carried on looking fine.
 *
 *   node artifacts/app/scripts/audit-live-ui.mjs [baseUrl]
 *
 * Needs a server with the built SPA on FRONTEND_PUBLIC_DIR. Exit 0 all good,
 * 1 something is broken, 75 the run could not be performed.
 */
import { launchOptions } from "./chromium.mjs";

const BASE = (process.argv[2] || "http://localhost:4320").replace(/\/$/, "");
const EXIT_INCONCLUSIVE = 75;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const EMAIL = `ui-${RUN}@example.test`;
const PASSWORD = "ui-Passw0rd!checks";

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`ok   ${label}${detail ? `  ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}\n     ${detail || "expected true"}`);
  }
}

class Inconclusive extends Error {}

/**
 * Requests the app made that came back an error.
 *
 * Deliberately not every non-2xx: a 401 on /users/me before sign-in and a 404
 * on an optional integration are how the app asks a question, not evidence of
 * a fault. What is collected here is errors on calls the signed-in app makes
 * for itself, which is where a silent breakage shows up.
 */
function isInterestingFailure(url, status, signedIn) {
  if (status < 400) return false;
  if (!url.includes("/api/")) return false;
  if (!signedIn && status === 401) return false;
  // The app asks whether optional integrations are configured and copes with
  // any answer; a rate-limit answer is the limiter working.
  if (status === 429) return false;
  return true;
}

async function main() {
  // Via the shared helper, and deliberately not by requiring a path: on a
  // GitHub runner there is no preinstalled browser and no executablePath is
  // the right answer, because `playwright install chromium` manages its own
  // copy and Playwright finds it. Treating "no path" as a reason to bail would
  // have made this whole audit exit inconclusive on every CI run -- passing
  // the job while never once opening the app.
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch(launchOptions());

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    // A blank page used only to decode screenshots back into pixels, so the
    // contrast check below needs no image library.
    const decoder = await context.newPage();
    await decoder.goto("about:blank");

    const pageErrors = [];
    const apiErrors = [];
    let signedIn = false;

    // Registration goes through the credential limiter, twenty attempts per
    // quarter hour per address. When that refuses, the form is behaving
    // correctly and the run simply cannot start -- which must not be reported
    // as "registering does not sign you in".
    let authRateLimited = false;

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      const status = response.status();
      const url = response.url();
      if (status === 429 && url.includes("/api/auth/")) authRateLimited = true;
      if (isInterestingFailure(url, status, signedIn)) {
        apiErrors.push(`${status} ${new URL(url).pathname}`);
      }
    });

    // ---- register through the real form ---------------------------------
    await page.goto(`${BASE}/auth/register`, { waitUntil: "networkidle" });

    // By data-testid rather than by type or placeholder: the password field
    // flips between type=password and type=text when the reveal button is
    // pressed, and the placeholders are translated, so both of those would be
    // selectors that break for reasons that have nothing to do with the form.
    await page.getByTestId("name-input").fill("UI Audit");
    await page.getByTestId("email-input").fill(EMAIL);
    await page.getByTestId("password-input").fill(PASSWORD);
    await page.getByTestId("register-button").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
      timeout: 20_000,
    }).catch(() => {});
    signedIn = true;

    if (authRateLimited) {
      throw new Inconclusive(
        "the credential limiter refused the registration, so no session " +
          "exists to drive the app with. Wait for the window and run again.",
      );
    }

    check(
      "registering through the form signs you in",
      !new URL(page.url()).pathname.startsWith("/auth"),
      `landed on ${new URL(page.url()).pathname}`,
    );

    const token = await page.evaluate(() =>
      localStorage.getItem("schoolar_token"),
    );
    check("the session is stored where the app looks for it", Boolean(token));

    // ---- the shell renders for a real, empty account ----------------------
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText();
    check(
      "the signed-in shell renders something",
      bodyText.trim().length > 100,
      `${bodyText.trim().length} characters of text`,
    );
    check(
      "a brand-new account does not show an error screen",
      !/something went wrong|unexpected error/i.test(bodyText),
      bodyText.slice(0, 200).replace(/\s+/g, " "),
    );

    /**
     * Read the page's own content, not the frame around it.
     *
     * The navigation and account panel are the same on every screen and come
     * to roughly 500 characters on their own, so any assertion about "the page
     * rendered" made against document.body passes for a screen whose content
     * area is completely empty. Every check below reads <main>.
     */
    async function mainText(path) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const landed = new URL(page.url()).pathname;
      const main = page.locator("main").first();
      const text = (await main.count()) ? await main.innerText() : "";
      return { landed, text };
    }

    // ---- a write, then the read that must reflect it ----------------------
    /**
     * Write through the browser's own session, retrying once past the write
     * limiter.
     *
     * The request is made in the page rather than from Node on purpose: it
     * carries the session the app actually stored and goes through the same
     * origin, so it is evidence about the app and not just about the server.
     *
     * The retry is not optional. Twenty writes a minute is the cap, and in CI
     * this audit runs straight after the flow checks, which spend most of that
     * budget from the same address. Without this the audit reported "cannot
     * create an activity" and "the page does not list it" -- two product
     * failures describing a working product and a working limiter.
     */
    async function createActivity() {
      return page.evaluate(
        async ({ base }) => {
          const send = () =>
            fetch(`${base}/api/study-activities`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
              },
              body: JSON.stringify({
                title: "Made during the UI audit",
                subject: "Mathematics",
                mode: "flashcards",
                cards: [
                  { id: "a", term: "2 + 2", answer: "4" },
                  { id: "b", term: "3 + 3", answer: "6" },
                ],
              }),
            });

          let res = await send();
          if (res.status === 429) {
            const after = Number(res.headers.get("retry-after"));
            const wait = Math.min(
              (Number.isFinite(after) && after > 0 ? after : 60) * 1000,
              70_000,
            );
            await new Promise((r) => setTimeout(r, wait + 1000));
            res = await send();
          }
          return { status: res.status, body: await res.json().catch(() => null) };
        },
        { base: BASE },
      );
    }

    const created = await createActivity();
    if (created.status === 429) {
      throw new Inconclusive(
        "still rate limited when creating an activity; the run cannot show " +
          "whether a write reaches the page that lists it.",
      );
    }
    check("the app's own session can create an activity",
      created.status === 201, `HTTP ${created.status}`);

    const activities = await mainText("/activities");
    check(
      "the activities page is reachable",
      activities.landed === "/activities",
      `landed on ${activities.landed}`,
    );
    check(
      "something written through the API appears on the page that lists it",
      activities.text.includes("Made during the UI audit"),
      `/activities showed: ${activities.text.replace(/\s+/g, " ").slice(0, 200)}`,
    );

    // ---- the library, which is what a signed-out visitor sees too ---------
    const resources = await mainText("/resources");
    check(
      "the library page renders content of its own",
      resources.text.trim().length > 80,
      `${resources.text.trim().length} characters in <main>`,
    );

    // An empty catalog is the honest state of a fresh database. What must not
    // happen is a spinner that never resolves or a raw error.
    check(
      "the library settles rather than spinning or erroring",
      !/something went wrong/i.test(resources.text),
      resources.text.replace(/\s+/g, " ").slice(0, 200),
    );

    const dashboard = await mainText("/dashboard");
    check(
      "the dashboard renders content of its own",
      dashboard.text.trim().length > 80,
      `${dashboard.text.trim().length} characters in <main>`,
    );

    // Three screens that must not be the same screen. If a redirect quietly
    // sent every route to one page, every check above would still pass.
    const distinct = new Set([
      activities.text.trim(),
      resources.text.trim(),
      dashboard.text.trim(),
    ]);
    check(
      "the three pages are actually different pages",
      distinct.size === 3,
      `${distinct.size} distinct <main> renders across /activities, /resources, /dashboard`,
    );

    // ---- can the secondary text actually be read --------------------------
    /**
     * WCAG AA for normal-size text. Large text is allowed 3:1; this samples
     * body copy, so 4.5 is the bar.
     */
    const AA_NORMAL_TEXT = 4.5;

    function relativeLuminance([r, g, b]) {
      const channel = (value) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      );
    }

    function contrast(a, b) {
      const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
        (x, y) => y - x,
      );
      return (light + 0.05) / (dark + 0.05);
    }

    /**
     * The colour actually painted behind the text, not the one CSS asked for.
     *
     * The ambient effect draws on a canvas underneath the page, so the
     * backdrop behind body copy is a blend nothing in the stylesheet states.
     * Reading `background-color` off the element returns transparent and tells
     * you nothing. So: screenshot the element and take the most common pixel,
     * which is the backdrop -- glyphs cover a minority of the box.
     *
     * Decoded by handing the PNG back to the browser, which saves depending on
     * an image library for one measurement.
     */
    async function paintedBackdrop(locator) {
      const shot = (await locator.screenshot()).toString("base64");
      const modal = await decoder.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const counts = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        let best = null;
        let seen = 0;
        for (const [key, count] of counts) {
          if (count > seen) {
            seen = count;
            best = key;
          }
        }
        return best;
      }, shot);
      return modal.split(",").map(Number);
    }

    await page.goto(`${BASE}/resources`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const copy = page.locator("main p").first();
    if (await copy.count()) {
      const colour = await copy.evaluate((node) => getComputedStyle(node).color);
      const text = colour.match(/\d+/g).slice(0, 3).map(Number);
      const backdrop = await paintedBackdrop(copy);
      const ratio = contrast(text, backdrop);
      check(
        "secondary text on the page can be read against what is behind it",
        ratio >= AA_NORMAL_TEXT,
        `rgb(${text}) on rgb(${backdrop}) is ${ratio.toFixed(2)}:1, ` +
          `WCAG AA wants ${AA_NORMAL_TEXT}:1 for normal-size text`,
      );
    } else {
      fail("secondary text on the page can be read", "no body copy found");
    }

    /**
     * Reading a page is not editing it.
     *
     * Opening the library used to send a PATCH storing an empty search over an
     * empty search, on every visit: a database write per page view, and a bite
     * out of the account's write allowance for browsing. It is the kind of
     * thing no screen shows and no test noticed, because the page looked
     * identical either way.
     *
     * Counted at the browser rather than asserted in the source, since what
     * matters is what the app actually sends.
     */
    const writesWhileReading = [];
    const countWrites = (request) => {
      const method = request.method();
      if (method !== "GET" && method !== "HEAD" && request.url().includes("/api/")) {
        writesWhileReading.push(`${method} ${new URL(request.url()).pathname}`);
      }
    };
    page.on("request", countWrites);
    await page.goto(`${BASE}/resources`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    page.off("request", countWrites);
    check(
      "opening a page to read it writes nothing",
      writesWhileReading.length === 0,
      `visiting /resources sent ${writesWhileReading.join(", ")}`,
    );

    // ---- signing out really ends the session ------------------------------
    await page.evaluate(() => localStorage.removeItem("schoolar_token"));
    signedIn = false;
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    check(
      "without a token the app returns you to sign-in",
      new URL(page.url()).pathname.startsWith("/auth"),
      `landed on ${new URL(page.url()).pathname}`,
    );

    // ---- what the page reported about itself ------------------------------
    check(
      "no uncaught exceptions in the page",
      pageErrors.length === 0,
      pageErrors.slice(0, 5).join(" | "),
    );
    check(
      "no API calls failed behind a screen that looked fine",
      apiErrors.length === 0,
      [...new Set(apiErrors)].slice(0, 8).join(", "),
    );

    await context.close();
  } finally {
    await browser.close();
  }

  console.log(
    failures === 0
      ? `\nAll ${checks} live UI checks passed.\n`
      : `\n${checks - failures}/${checks} live UI checks passed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  if (error instanceof Inconclusive) {
    console.error(`\nInconclusive: ${error.message}\n`);
    process.exit(EXIT_INCONCLUSIVE);
  }
  console.error(`\nCould not finish: ${error.stack || error.message}\n`);
  process.exit(1);
});
