#!/usr/bin/env node
/**
 * Every screen of the phone app, in every language, rendered.
 *
 * `mobileSpeaksSixLanguages.test.ts` reads the source and answers "is every
 * string wrapped and is every wrapped string translated". That is the cheap
 * half and it runs in a third of a second. It cannot answer the half that
 * matters to somebody holding the phone: does the screen still come up.
 *
 * Wrapping 252 strings touched twenty-five files by hand and by script, and
 * the ways that goes wrong are not type errors. A hook added inside a
 * destructuring parameter list rather than after it. A `t()` dropped into a
 * string literal, so `'✓ Accepted'` became `'✓ {t('Accept')}ed'`. Both
 * happened here. One was caught by the compiler; the other was caught because
 * something was rendered and looked at.
 *
 * So this loads each route in each language against a stubbed server, and
 * fails if a screen renders the error boundary, renders nothing, or leaves a
 * control with no name for a screen reader to read. Both have
 * fired here for real: the profile screen went to its error boundary in all
 * six languages, and the cause was a crash this file's stub provoked and the
 * product then had to survive.
 *
 * It also compares the languages against each other, which is a weak backstop
 * and is worth saying so. Measured: replacing the classes screen's translator
 * with a passthrough did not fail this, because the tab bar underneath was
 * still translated and the two renders still differed. It only catches a
 * screen where nothing at all is translated. The source check
 * (mobileSpeaksSixLanguages.test.ts) is what catches one missed string; this
 * is what catches a screen that no longer comes up.
 *
 * The accessible-name half rides along because the pages are already rendered
 * and it is the same question in a different sense: a control nobody can name
 * is as unusable as a screen that will not come up. It found the login and
 * sign-up fields nameless -- the shared Input drew its label as a <Text>
 * beside the field, which pairs them for the eye and not at all for VoiceOver,
 * so every field in every form in this app was an unnamed text box -- and the
 * role switch, the control that moves you between the student and teacher
 * halves of the product, announcing as "switch, off".
 *
 * Contrast is not checked here either, and that one took a measurement to
 * settle. Rendering all eight screens in both colour schemes and computing
 * WCAG ratios reported fourteen failures, and every one was an artefact: the
 * paywall and onboarding heroes are white text on a LinearGradient, and a
 * walker looking for a solid backgroundColor skips straight past a gradient to
 * the page behind it and reports white-on-white. The rest were Feather icon
 * glyphs, which are private-use codepoints rather than words. Nothing real.
 * The palettes are covered by session-palette.test.ts and the scheme by
 * mobileFollowsTheScheme.test.ts; the web's audit-pages.mjs learned to read
 * gradient stops off the back of this.
 *
 * What it does not check, having looked: whether the translated text fits the
 * box drawn for it. That is a real class -- the web app had nine of them, one
 * visible as "Desactivadc" in a toolbar -- and measuring every screen here in
 * English, German, Turkish and Spanish found none. React Native lays out with
 * flexbox and wraps by default, so the fixed widths that catch a web app are
 * mostly not here. Recorded so the next person does not repeat the search;
 * artifacts/app/scripts/audit-text-fits.mjs is the check for the side where it
 * does bite.
 *
 * The stub is deliberately thin -- empty collections and a plain profile --
 * because the question here is whether the screens survive translation, not
 * whether they show the right data. audit-screens.mjs drives the real server
 * for that, and needs one.
 *
 *   pnpm --filter @workspace/mobile exec expo export --platform web \
 *     --output-dir .expo/web-export
 *   node scripts/audit-languages.mjs
 *
 * Exit codes: 0 every screen rendered in every language, 1 something is
 * broken, 75 the run could not look (no export, no browser).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR =
  process.env.MOBILE_WEB_EXPORT || path.join(HERE, "..", ".expo", "web-export");
const PORT = Number(process.env.MOBILE_LANG_PORT ?? 4328);
const APP_ORIGIN = "https://casparel.com";

const LANGUAGES = (process.env.MOBILE_LANGS ?? "en,es,fr,de,pt,tr").split(",");

/**
 * Each route, and the session it needs to actually be that route.
 *
 * "new" matters: an account that has finished onboarding is sent from
 * /onboarding to the dashboard, which is right, and which meant this list
 * asked for the welcome screen and got the dashboard twice. The state is part
 * of the address.
 */
const SCREENS = [
  { path: "/login", session: "out" },
  { path: "/register", session: "out" },
  { path: "/onboarding", session: "new" },
  // The tabs group is served at the root, not at "/(tabs)".
  { path: "/", session: "in" },
  { path: "/(tabs)/resources", session: "in" },
  { path: "/(tabs)/schedule", session: "in" },
  { path: "/(tabs)/classes", session: "in" },
  { path: "/(tabs)/profile", session: "in" },
  { path: "/paywall", session: "in" },
  // The flashcard player, with the set below standing in for a real one. Every
  // other screen here renders a list; this one renders a single card, and the
  // strings on it -- Term, Answer, Tap to turn over -- exist nowhere else.
  { path: "/study/7", session: "in" },
  // Messages, which is reached from the dashboard header rather than a tab, so
  // no other entry here renders it. Its empty state and its section headings
  // exist nowhere else.
  { path: "/messages", session: "in" },
  /*
   * Goals, also reached from the dashboard rather than a tab.
   *
   * The list and the detail are both here because they say different things:
   * the list carries the status word and the empty state, the detail carries
   * the level, the step hints and "Every step is done." The detail is also
   * the only screen in the app with a checkbox, and its two labels -- mark as
   * done, mark as not done -- exist nowhere else.
   */
  { path: "/goals", session: "in" },
  { path: "/goals/11", session: "in" },
];

const MIME = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

class Inconclusive extends Error {}

/** What the stubbed server answers, by path suffix. Everything else is []. */
function stubbedBody(pathname) {
  if (pathname.endsWith("/users/me")) {
    return {
      id: 1,
      email: "audit@casparel.test",
      name: "Audit Account",
      role: "student",
      activeRole: "student",
      plan: "free",
      subjects: [],
      bio: null,
      avatarUrl: null,
      gradeOrDept: null,
      timezone: null,
      websiteUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }
  if (pathname.endsWith("/users/me/preferences")) return { language: null };
  if (pathname.endsWith("/calendar/status")) {
    return { googleConnected: false, googleConfigured: false, icalSecret: "x" };
  }
  if (pathname.endsWith("/calendar/ical-url")) return { url: `${APP_ORIGIN}/feed.ics` };
  if (pathname.endsWith("/usage")) {
    // The real shape. `[]` is truthy, so a lazy stub here is not a neutral
    // one: it walked the profile screen straight into its error boundary.
    const allowance = { used: 0, limit: 10, window: "day" };
    return {
      plan: "Free",
      tier: "free",
      unlimited: false,
      aiSearch: allowance,
      deepResearch: { ...allowance, window: "month" },
      capacity: {
        classesOwned: { used: 0, limit: 1 },
        classMembers: { used: 0, limit: 30 },
        studyActivities: { used: 0, limit: 25 },
        resourceLists: { used: 0, limit: 5 },
        learningGoals: { used: 0, limit: 10 },
        canvases: { used: 0, limit: 3 },
      },
    };
  }
  if (pathname.includes("/dashboard")) {
    return { resourceCount: 0, reviewCount: 0, classCount: 0, upcomingCount: 0 };
  }
  if (pathname.endsWith("/learning-goals")) {
    /*
     * One goal, part-way through, with a level and a status.
     *
     * Part-way matters: a path with every step done, or none, renders only
     * one of the two step states, and the tick and the strike-through are
     * half of what this screen is.
     */
    return [
      {
        id: 11,
        userId: 1,
        title: "Audit goal",
        subject: "Mathematics",
        description: "Standing in for a real goal.",
        level: "intermediate",
        preferredFormats: null,
        targetDate: null,
        status: "active",
        pathSteps: [
          { id: "s1", title: "Read the chapter", query: "chapter", completed: true },
          { id: "s2", title: "Try the practice set", query: "practice", completed: false },
        ],
        createdAt: "2026-03-02T09:00:00.000Z",
        updatedAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  if (pathname.endsWith("/study-activities")) {
    // Two cards, because the player's controls differ on the first and the
    // last: one card would render both as disabled and check neither.
    return [
      {
        id: 7,
        ownerId: 1,
        workspaceRole: "student",
        classId: null,
        title: "Audit study set",
        subject: "Mathematics",
        mode: "flashcards",
        shareToken: null,
        cards: [
          { id: "a", term: "derivative", answer: "rate of change" },
          { id: "b", term: "integral", answer: "area under a curve" },
        ],
        createdAt: "2026-03-02T09:00:00.000Z",
        updatedAt: "2026-03-02T09:00:00.000Z",
      },
    ];
  }
  return [];
}

/**
 * Controls a reader can reach but a screen reader cannot name.
 *
 * aria-hidden and tabindex="-1" are skipped: react-native-web renders hidden
 * companions beside some controls, and reporting those is noise.
 */
const NAMELESS = `(() => {
  const CONTROLS =
    'button, a[href], [role="button"], [role="link"], [role="switch"], ' +
    '[role="tab"], [role="checkbox"], input:not([type="hidden"]), select, textarea';
  const out = [];
  for (const element of document.querySelectorAll(CONTROLS)) {
    if (!element.getClientRects().length) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (element.closest('[aria-hidden="true"]')) continue;
    if (element.getAttribute('tabindex') === '-1') continue;
    const named =
      (element.getAttribute('aria-label') || '').trim() ||
      element.getAttribute('aria-labelledby') ||
      (element.getAttribute('title') || '').trim() ||
      (element.textContent || '').trim() ||
      element.closest('label');
    if (!named) {
      out.push(
        element.tagName.toLowerCase() +
          (element.getAttribute('role') ? '[role=' + element.getAttribute('role') + ']' : '') +
          (element.type ? '[' + element.type + ']' : ''),
      );
    }
  }
  return out;
})()`;

async function main() {
  if (!fs.existsSync(path.join(EXPORT_DIR, "index.html"))) {
    throw new Inconclusive(
      `no web export at ${EXPORT_DIR}. Build one with:\n` +
        `  pnpm --filter @workspace/mobile exec expo export --platform web ` +
        `--output-dir .expo/web-export`,
    );
  }

  /*
   * playwright-core is deliberately not a dependency of any package here --
   * it is a tool, not something a bundle needs -- so CI installs it out of
   * tree and links it into artifacts/app. audit-screens.mjs looks in the same
   * two places for the same reason.
   */
  let chromium;
  let launchOptions;
  try {
    try {
      ({ chromium } = await import("playwright-core"));
    } catch {
      const beside = path.join(HERE, "..", "..", "app", "node_modules", "playwright-core");
      if (!fs.existsSync(beside)) throw new Error("playwright-core is not installed");
      // By path it arrives as CommonJS, so the named exports sit on `default`.
      const loaded = await import(new URL(`file://${beside}/index.js`).href);
      chromium = (loaded.chromium ? loaded : loaded.default).chromium;
    }
    ({ launchOptions } = await import("../../app/scripts/chromium.mjs"));
  } catch (error) {
    throw new Inconclusive(`no browser available: ${String(error)}`);
  }

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
  const failures = [];
  /** route -> language -> the words on screen, to compare languages. */
  const seen = new Map();
  let rendered = 0;

  for (const language of LANGUAGES) {
    for (const screen of SCREENS) {
      const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
      });
      await context.addInitScript(
        ({ lang, session }) => {
          localStorage.setItem("casparel_language", lang);
          if (session === "out") return;
          localStorage.setItem("schoolar_token", "audit-session");
          // 'true', not '1': OnboardingContext compares against the word, and
          // anything else means "not onboarded yet" -- which sent every
          // signed-in route to the onboarding screen and had this audit
          // reporting seven screens after rendering one, seven times.
          if (session === "in") localStorage.setItem("casparel_onboarded", "true");
        },
        { lang: language, session: screen.session },
      );
      // The app hardcodes its origin, so the requests are caught here.
      await context.route(`${APP_ORIGIN}/**`, (route) => {
        const { pathname } = new URL(route.request().url());
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(stubbedBody(pathname)),
        });
      });

      const page = await context.newPage();
      const crashes = [];
      page.on("pageerror", (error) => crashes.push(String(error)));

      const where = `${screen.path} [${language}]`;
      try {
        await page.goto(`http://127.0.0.1:${PORT}${screen.path}`, {
          waitUntil: "networkidle",
          timeout: 45000,
        });
        await page.waitForTimeout(600);
        const text = (await page.evaluate(() => document.body.innerText)).trim();
        rendered += 1;

        if (!text) {
          failures.push(`${where}: rendered nothing`);
        } else if (/Something went wrong|Please reload the app/i.test(text)) {
          // The error boundary. Which is exactly what a hook called in the
          // wrong place produces.
          failures.push(`${where}: error boundary — ${text.slice(0, 120)}`);
        } else {
          const byLanguage = seen.get(screen.path) ?? new Map();
          byLanguage.set(language, text);
          seen.set(screen.path, byLanguage);
        }
        for (const crash of crashes) failures.push(`${where}: ${crash.slice(0, 160)}`);
        // Once per route, not once per language: a nameless control is the
        // same control in all six, and six copies of it is five of noise.
        if (language === LANGUAGES[0]) {
          for (const control of await page.evaluate(NAMELESS)) {
            failures.push(`${screen.path}: no accessible name: ${control}`);
          }
        }
        console.log(`  ok   ${where}  (${text.split("\n").length} lines)`);
      } catch (error) {
        failures.push(`${where}: ${String(error).slice(0, 160)}`);
        console.error(`  FAIL ${where}`);
      }
      await context.close();
    }
  }

  await browser.close();
  server.close();

  /*
   * Nine routes that all render the same thing is one route rendered nine
   * times, and that is what this was doing until the onboarding flag was
   * written the way the app reads it. Distinct screens are the premise every
   * other assertion here rests on, so it is checked rather than assumed.
   */
  const englishRenders = new Map();
  for (const [route, byLanguage] of seen) {
    const english = byLanguage.get("en");
    if (english) englishRenders.set(route, english);
  }
  const byContent = new Map();
  for (const [route, text] of englishRenders) {
    byContent.set(text, (byContent.get(text) ?? []).concat(route));
  }
  for (const routes of byContent.values()) {
    if (routes.length > 1) {
      failures.push(
        `these routes rendered the same screen, so only one of them was ` +
          `really checked: ${routes.join(", ")}`,
      );
    }
  }

  /*
   * A screen that reads the same in English and in Turkish is a screen no
   * translator reached at all. A weak signal, kept because it costs nothing
   * and the case it catches is total: anything short of that -- one component
   * losing its translator, one string left English -- still differs here,
   * because the tab bar alone is enough to tell the two renders apart.
   */
  for (const [route, byLanguage] of seen) {
    const english = byLanguage.get("en");
    if (!english) continue;
    for (const [language, text] of byLanguage) {
      if (language === "en") continue;
      if (text === english) {
        failures.push(`${route} [${language}]: identical to the English render`);
      }
    }
  }

  if (rendered === 0) throw new Inconclusive("no screen rendered; this run checked nothing");

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(
    `\n${rendered} screen renders across ${LANGUAGES.length} languages, ` +
      `all in the language asked for.`,
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof Inconclusive) {
    console.error(`Inconclusive: ${error.message}`);
    process.exit(75);
  }
  throw error;
}
