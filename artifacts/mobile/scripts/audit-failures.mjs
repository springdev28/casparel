#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Audit Failures behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every screen of the phone app when the server does not answer.
 *
 * `audit-languages.mjs` renders the same screens against a stub that always
 * says 200 with a well-formed body. That is the happy half, and it is the only
 * half anything here has ever rendered: not one error state, offline state or
 * retry on this phone app has been drawn by a check. They are translated,
 * because the source scan reads their strings, and never seen.
 *
 * The failure this exists for is specific and is the worst one a reader can be
 * shown. A screen that treats "the request failed" as "there is nothing here"
 * tells somebody their lists are gone. It renders perfectly, it says a true-
 * sounding sentence -- "No learning lists yet" -- and it is a lie about the
 * reader's own data. So the rule is: when nothing loads, no screen may show an
 * empty state, and every screen must say that it could not load.
 *
 * Two ways of not answering, because the app distinguishes them and a person
 * does too:
 *
 *   offline   the request never reaches a server -- airplane mode, no signal,
 *             DNS or TLS failure. `describeQueryError` has no status to read
 *             and says "You're offline".
 *   broken    the server answers 500. There is a status, so the app says
 *             something went wrong at its end rather than blaming the
 *             connection.
 *   waiting   the server never answers at all. Nothing has failed yet, so a
 *             screen that has reached for its empty state has jumped to a
 *             conclusion: "No learning lists yet" while the request is still
 *             in flight is the same lie as showing it when the request failed,
 *             a second or two earlier. The web has checked this since a
 *             library screen painted "Your library is empty" during load.
 *   expired   the server answers 401. This one is not an error state at all:
 *             a session the server has rejected is over, and the only honest
 *             screen is the sign-in screen. It used to be an error state --
 *             every screen said "your session may have expired, sign in
 *             again" above a Retry that could never succeed, and offered no
 *             way to sign in. So this case asks for a different thing: that
 *             the app leaves.
 *
 * Usage, after building a web export as audit-languages.mjs describes:
 *
 *   node artifacts/mobile/scripts/audit-failures.mjs
 *
 * Exit 0 every screen fails honestly, 1 one does not, 75 the run could not
 * look (no export, no browser).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR =
  process.env.MOBILE_WEB_EXPORT || path.join(HERE, "..", ".expo", "web-export");
const PORT = Number(process.env.MOBILE_FAIL_PORT ?? 4334);
const APP_ORIGIN = "https://casparel.com";
const EXIT_INCONCLUSIVE = 75;

/**
 * The screens that read something, in the language of a reader who is not
 * English -- because a failure state falling back to English is the same bug
 * as any other string doing so, and this is the only run that renders one.
 */
const LANGUAGE = process.env.MOBILE_FAIL_LANG ?? "tr";

const SCREENS = [
  { path: "/", label: "dashboard" },
  { path: "/(tabs)/resources", label: "library" },
  { path: "/(tabs)/schedule", label: "schedule" },
  { path: "/(tabs)/classes", label: "classes" },
  { path: "/(tabs)/profile", label: "profile" },
  { path: "/study/7", label: "a study set" },
  { path: "/messages", label: "messages" },
  { path: "/goals", label: "goals" },
  { path: "/goals/11", label: "a goal" },
  { path: "/lists", label: "learning lists" },
  { path: "/lists/11", label: "a learning list" },
];

/**
 * What a screen says when there is nothing to show.
 *
 * None of these may appear while the requests behind the screen are failing.
 * Taken from the `Empty` titles in the app's own source rather than invented
 * here, so a new empty state joins this rule by existing.
 */
const EMPTY_STATE_TITLES = [
  "Class not found",
  "Goal not found",
  "List not found",
  "No activity yet",
  "No classes yet",
  "No conversations yet",
  "No events scheduled",
  "No learning goals yet",
  "No learning lists yet",
  "No members yet",
  "No reviews yet",
  "No study sets yet",
  "Nothing in this list yet",
  "Resource not found",
  "Study set not found",
  "This goal has no steps yet",
  "This set has no cards yet",
];

/** The three things `describeQueryError` can say, as the reader sees them. */
const FAILURE_TITLES = ["You're offline", "You don't have access to this", "Couldn't load this"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

class Inconclusive extends Error {}

let failures = [];
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) console.log(`  ok   ${label}${detail ? `  ${detail}` : ""}`);
  else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${label}${detail ? `  ${detail}` : ""}`);
  }
}

/** The dictionary, so a Turkish render can be checked against Turkish words. */
async function translations(language) {
  if (language === "en") return {};
  const file = path.join(HERE, "..", "lib", "i18n", `${language}.ts`);
  const source = fs.readFileSync(file, "utf8");
  const dictionary = {};
  for (const match of source.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)) {
    dictionary[match[1].replace(/\\"/g, '"')] = match[2].replace(/\\"/g, '"');
  }
  return dictionary;
}

async function main() {
  if (!fs.existsSync(path.join(EXPORT_DIR, "index.html"))) {
    throw new Inconclusive(
      `no web export at ${EXPORT_DIR}. Build one with:\n` +
        `  pnpm --filter @workspace/mobile exec expo export --platform web ` +
        `--output-dir .expo/web-export`,
    );
  }

  let chromium;
  let launchOptions;
  try {
    try {
      ({ chromium } = await import("playwright-core"));
    } catch {
      const beside = path.join(HERE, "..", "..", "app", "node_modules", "playwright-core");
      if (!fs.existsSync(beside)) throw new Error("playwright-core is not installed");
      const loaded = await import(new URL(`file://${beside}/index.js`).href);
      chromium = (loaded.chromium ? loaded : loaded.default).chromium;
    }
    ({ launchOptions } = await import("../../app/scripts/chromium.mjs"));
  } catch (error) {
    throw new Inconclusive(`no browser available: ${String(error)}`);
  }

  const dictionary = await translations(LANGUAGE);
  const say = (english) => dictionary[english] ?? english;
  const emptyStates = EMPTY_STATE_TITLES.map(say);
  const failureTitles = FAILURE_TITLES.map(say);

  const server = http
    .createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
      let file = path.join(EXPORT_DIR, url);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(EXPORT_DIR, "index.html");
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
      });
      res.end(fs.readFileSync(file));
    })
    .listen(PORT, "127.0.0.1");

  const browser = await chromium.launch(launchOptions());

  for (const how of ["waiting", "offline", "broken", "expired"]) {
    const situation = {
      waiting: "The server has not answered yet",
      offline: "Nothing reaches a server",
      broken: "The server answers 500",
      expired: "The server rejects the session",
    }[how];
    console.log(`\n${situation}, in ${LANGUAGE}:\n`);
    for (const screen of SCREENS) {
      const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
      await context.addInitScript(
        ({ lang }) => {
          localStorage.setItem("casparel_language", lang);
          localStorage.setItem("schoolar_token", "audit-session");
          localStorage.setItem("casparel_onboarded", "true");
        },
        { lang: LANGUAGE },
      );
      await context.route(`${APP_ORIGIN}/**`, (route) => {
        // Held open, never answered and never refused: the screen stays in the
        // state it shows while it is waiting, which is the state under test.
        if (how === "waiting") return;
        return how === "offline"
          ? route.abort("connectionrefused")
          : route.fulfill({
              status: how === "expired" ? 401 : 500,
              contentType: "application/json",
              body: JSON.stringify({
                error: how === "expired" ? "Unauthorized" : "Something went wrong",
              }),
            });
      });

      const page = await context.newPage();
      const crashes = [];
      page.on("pageerror", (error) => crashes.push(String(error)));

      try {
        await page.goto(`http://127.0.0.1:${PORT}${screen.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        // Long enough for react-query to give up and the screen to settle on
        // whatever it shows when it has nothing.
        await page.waitForTimeout(2500);
        const text = (await page.evaluate(() => document.body.innerText)).trim();

        const where = `${screen.label} [${how}]`;

        /*
         * Still waiting is not the same as having nothing. A screen that has
         * reached for its empty state before the answer arrives is telling
         * somebody their lists are gone, a second before it would have been
         * able to tell them the truth.
         */
        if (how === "waiting") {
          const shownEarly = emptyStates.filter((title) => text.includes(title));
          check(
            `${where} does not decide the reader has nothing`,
            shownEarly.length === 0,
            shownEarly.length ? `showed ${JSON.stringify(shownEarly)}` : "",
          );
          check(
            `${where} draws something while it waits`,
            text.length > 0,
            text.length ? "" : "blank screen",
          );
          for (const crash of crashes) {
            check(`${where} threw nothing`, false, crash.slice(0, 160));
          }
          continue;
        }

        /*
         * A rejected session is not something to report on the screen
         * somebody happened to be on. It is over, so the app has to leave.
         * Asserted on the address rather than on words, because what matters
         * is that there is a way back in and not that a sentence was shown.
         */
        if (how === "expired") {
          const landed = new URL(page.url()).pathname;
          check(
            `${where} returns to sign-in`,
            landed.includes("login") || landed.includes("register"),
            `stayed on ${landed}: ${text.replace(/\s+/g, " ").slice(0, 140)}`,
          );
          for (const crash of crashes) {
            check(`${where} threw nothing`, false, crash.slice(0, 160));
          }
          continue;
        }

        const shown = emptyStates.filter((title) => text.includes(title));
        check(
          `${where} does not claim the reader has nothing`,
          shown.length === 0,
          shown.length ? `showed ${JSON.stringify(shown)}` : "",
        );
        check(
          `${where} says it could not load`,
          failureTitles.some((title) => text.includes(title)),
          failureTitles.some((title) => text.includes(title))
            ? ""
            : `screen said: ${text.replace(/\s+/g, " ").slice(0, 160)}`,
        );
        check(
          `${where} does not reach the error boundary`,
          !/Something went wrong|Please reload the app/i.test(text) || failureTitles.some((t) => text.includes(t)),
          text.replace(/\s+/g, " ").slice(0, 120),
        );
        for (const crash of crashes) {
          check(`${where} threw nothing`, false, crash.slice(0, 160));
        }
      } catch (error) {
        check(`${screen.label} [${how}] renders at all`, false, String(error).slice(0, 160));
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();
  server.close();

  console.log("");
  if (failures.length) {
    console.error(`${failures.length} of ${checks} checks failed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `${checks} checks across ${SCREENS.length} screens and four ways of not ` +
      `answering: no screen decides the reader has nothing -- while waiting ` +
      `or after failing -- every failure says so, and a rejected session ` +
      `returns to sign-in.`,
  );
}

main().catch((error) => {
  if (error instanceof Inconclusive) {
    console.error(`inconclusive: ${error.message}`);
    process.exit(EXIT_INCONCLUSIVE);
  }
  console.error(error);
  process.exit(1);
});
