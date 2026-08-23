#!/usr/bin/env node
/**
 * @fileOverview Web support role: configures or validates the Beta Core Flows part of the Vite/React application.
 * System connection: participates in browser development, build, quality checks, or deployment.
 */
/**
 * Real-browser beta evidence for Casparel's two release-gate journeys.
 *
 * Every product action below is performed through the visible UI against the
 * target's real API and database. API calls are used only for health checks,
 * assertions from observed responses, and tightly scoped teardown of records
 * created by this run.
 *
 * Local:
 *   BETA_BASE_URL=http://127.0.0.1:23863 pnpm run beta:core
 *
 * Isolated staging (explicit opt-in is mandatory):
 *   BETA_BASE_URL=https://beta.example.test \
 *   BETA_ALLOW_STAGING_RUN=true pnpm run beta:core
 *
 * The script always refuses casparel.com and www.casparel.com.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { launchOptions } from "./chromium.mjs";
import {
  addLedgerResult,
  createLedger,
  resolveBetaConfig,
  writeLedger,
} from "./beta-ledger.mjs";

const VALIDATE_ONLY = process.argv.includes("--validate");
const SCENARIOS = [
  "AUTH-001",
  "SEARCH-002",
  "RES-004",
  "SEARCH-024",
  "RES-001/004/SEARCH-026",
  "PLAT-001",
  "LIST-002/004",
  "LIST-008/010",
  "GOAL-001/DASH-003",
  "CLASS-001",
  "CLASS-003",
  "AUTH-012/CLASS-004/005/022",
  "ROLE-002",
  "CLASS-011",
  "CLASS-013",
];

let config;
try {
  config = resolveBetaConfig(
    VALIDATE_ONLY && !process.env.BETA_BASE_URL
      ? {
          ...process.env,
          BETA_BASE_URL: "http://127.0.0.1:23863",
          BETA_RUN_ID: "validation-only",
        }
      : process.env,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

if (VALIDATE_ONLY) {
  console.log(`PASS: beta suite configuration is safe for ${config.baseUrl}`);
  console.log(`Scenarios: ${SCENARIOS.join(", ")}`);
  console.log(
    "No browser, network request, account, or database write was made.",
  );
  process.exit(0);
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
})();
const ledger = createLedger({ config, commit });
const runSuffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Beta-${randomBytes(9).toString("base64url")}9!`;
const names = {
  learner: `Beta Learner ${runSuffix}`,
  educator: `Beta Educator ${runSuffix}`,
  host: `Beta Host ${runSuffix}`,
  list: `Beta Mechanics Path ${runSuffix}`,
  class: `Beta Physics ${runSuffix}`,
  hostClass: `Beta Seminar ${runSuffix}`,
  assignment: `Explain momentum ${runSuffix}`,
};
const accounts = {
  learner: {
    name: names.learner,
    email: `casparel-beta-learner-${runSuffix}@example.invalid`,
  },
  educator: {
    name: names.educator,
    email: `casparel-beta-educator-${runSuffix}@example.invalid`,
  },
  host: {
    name: names.host,
    email: `casparel-beta-host-${runSuffix}@example.invalid`,
  },
};
const state = {
  resource: null,
  list: null,
  goal: null,
  educatorClass: null,
  hostClass: null,
  educatorResource: null,
  assignment: null,
  publicListToken: null,
};
const sessions = new Map();
const apiNetwork = [];
const pendingNetworkReads = new Set();
const origin = new URL(config.baseUrl).origin;
fs.mkdirSync(config.artifactDir, { recursive: true });

function appUrl(pathname) {
  return `${config.baseUrl}${pathname}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function apiPath(response) {
  const url = new URL(response.url());
  return `${url.pathname}${url.search}`;
}

function matchesApi(response, pathname, method) {
  const url = new URL(response.url());
  return (
    url.origin === origin &&
    (pathname instanceof RegExp
      ? pathname.test(url.pathname)
      : url.pathname === pathname) &&
    response.request().method() === method
  );
}

async function waitForApi(page, pathname, method, timeout = 60_000) {
  return page.waitForResponse(
    (response) => matchesApi(response, pathname, method),
    { timeout },
  );
}

function safeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function monitorPage(page, persona) {
  page.on("pageerror", (error) => {
    ledger.unexpectedConsoleErrors.push(
      `${persona}: pageerror: ${String(error).slice(0, 500)}`,
    );
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    ledger.unexpectedConsoleErrors.push(
      `${persona}: console: ${message.text().slice(0, 500)}`,
    );
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return;
    const entry = {
      at: new Date().toISOString(),
      persona,
      method: response.request().method(),
      url: `${url.pathname}${url.search}`,
      status: response.status(),
    };
    apiNetwork.push(entry);
    if (response.status() < 400) return;
    const read = response
      .text()
      .catch(() => "")
      .then((body) => {
        ledger.unexpectedApiErrors.push({
          ...entry,
          body: body.replace(/\s+/g, " ").slice(0, 300),
        });
      })
      .finally(() => pendingNetworkReads.delete(read));
    pendingNetworkReads.add(read);
  });
}

async function createSession(persona, viewport) {
  const context = await browser.newContext({
    viewport,
    locale: "en-US",
    timezoneId: "Europe/Istanbul",
  });
  const page = await context.newPage();
  monitorPage(page, persona);
  const session = { persona, context, page, token: null };
  sessions.set(persona, session);
  return session;
}

async function screenshot(page, id, status) {
  if (!page || page.isClosed()) return null;
  const target = path.join(
    config.artifactDir,
    `${safeName(id)}-${status.toLowerCase()}.png`,
  );
  try {
    await page.screenshot({ path: target, fullPage: true });
    return target;
  } catch {
    return null;
  }
}

async function scenario(id, persona, page, action) {
  const started = Date.now();
  let status = "PASS";
  let detail = "Completed through the visible UI.";
  try {
    const returned = await action();
    if (returned) detail = returned;
  } catch (error) {
    status = "FAIL-CONFIRMED";
    detail = error instanceof Error ? error.message : String(error);
  }
  const evidence = [];
  const image = await screenshot(page, id, status);
  if (image) evidence.push(image);
  addLedgerResult(ledger, {
    id,
    persona,
    status,
    durationMs: Date.now() - started,
    detail,
    evidence,
  });
  console.log(`${status.padEnd(16)} ${id.padEnd(19)} ${detail}`);
  return status === "PASS";
}

async function register(session, account) {
  const { page } = session;
  await page.goto(appUrl("/auth/register"), { waitUntil: "domcontentloaded" });
  await page.getByTestId("name-input").fill(account.name);
  await page.getByTestId("email-input").fill(account.email);
  await page.getByTestId("password-input").fill(password);
  const responsePromise = waitForApi(page, "/api/auth/register", "POST");
  await page.getByTestId("register-button").click();
  const response = await responsePromise;
  assert(
    response.status() === 201,
    `Registration returned HTTP ${response.status()}`,
  );
  await page.waitForURL(/\/resources(?:\?|$)/, { timeout: 30_000 });
  session.token = await page.evaluate(() =>
    localStorage.getItem("schoolar_token"),
  );
  assert(
    session.token,
    "Registration did not establish a schoolar_token session",
  );
}

async function selectOption(page, testId, optionName) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

async function switchWorkspace(session, role) {
  const responsePromise = waitForApi(
    session.page,
    "/api/users/me/role",
    "PATCH",
  );
  await selectOption(session.page, "role-select", role);
  const response = await responsePromise;
  assert(
    response.status() === 200,
    `Workspace switch returned HTTP ${response.status()}`,
  );
  await session.page.waitForTimeout(300);
  session.token = await session.page.evaluate(() =>
    localStorage.getItem("schoolar_token"),
  );
}

async function createClass(session, className) {
  const { page } = session;
  await page.getByTestId("nav-classes").click();
  await page.getByTestId("create-class-button").click();
  await page.getByTestId("class-name-input").fill(className);
  await page.getByTestId("class-subject-input").fill("Physics");
  await page.getByTestId("class-grade-input").fill("Year 12");
  const responsePromise = waitForApi(page, "/api/classes", "POST");
  await page.getByTestId("create-class-confirm").click();
  const response = await responsePromise;
  assert(
    response.status() === 201,
    `Class creation returned HTTP ${response.status()}`,
  );
  const created = await response.json();
  await page
    .getByTestId("class-card")
    .filter({ hasText: className })
    .waitFor({ state: "visible" });
  return created;
}

async function openClass(session, className) {
  const { page } = session;
  if (!new URL(page.url()).pathname.endsWith("/classes")) {
    await page.getByTestId("nav-classes").click();
  }
  await page.getByTestId("class-card").filter({ hasText: className }).click();
  await page.getByRole("heading", { name: className, exact: true }).waitFor();
}

async function issueJoinCode(session) {
  const { page } = session;
  await page.getByTestId("class-tab-assignments").click();
  await page.getByTestId("class-assignments").waitFor();
  const existing = page.getByTestId("class-join-code");
  if (!(await existing.count())) {
    const responsePromise = waitForApi(
      page,
      /\/api\/classes\/\d+\/join-code$/,
      "POST",
    );
    await page.getByTestId("create-join-code-button").click();
    const response = await responsePromise;
    assert(
      response.status() === 200,
      `Join-code creation returned HTTP ${response.status()}`,
    );
  }
  await existing.waitFor({ state: "visible" });
  const code = (await existing.textContent())?.match(/[A-F0-9]{8}/)?.[0];
  assert(code, "The issued join code was not visible in the class UI");
  await page
    .getByTestId("copy-class-join-link")
    .waitFor({ state: "visible" });
  return code;
}

async function joinClassFromSignedOutInvite(session, code, account) {
  const { page } = session;
  const invitePath = `/classes?join=${code}`;

  await page.getByTestId("logout-button").click();
  await page.waitForURL(/\/resources(?:\?|$)/, { timeout: 30_000 });
  await page.goto(appUrl(invitePath), { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/auth\/login(?:\?|$)/, { timeout: 30_000 });

  const loginUrl = new URL(page.url());
  assert(
    loginUrl.searchParams.get("next") === invitePath,
    "Signed-out invite did not preserve its internal destination",
  );
  await page.getByTestId("email-input").fill(account.email);
  await page.getByTestId("password-input").fill(password);
  const loginResponsePromise = waitForApi(page, "/api/auth/login", "POST");
  await page.getByTestId("login-button").click();
  const loginResponse = await loginResponsePromise;
  assert(
    loginResponse.status() === 200,
    `Invite sign-in returned HTTP ${loginResponse.status()}`,
  );

  await page.waitForURL(/\/classes\?join=[A-F0-9]{8}$/, {
    timeout: 30_000,
  });
  const input = page.getByTestId("join-code-input");
  await input.waitFor({ state: "visible" });
  assert(
    (await input.inputValue()) === code,
    "Invite did not prefill the expected class code",
  );

  const joinResponsePromise = waitForApi(page, "/api/classes/join", "POST");
  await page.getByTestId("join-class-confirm").click();
  const joinResponse = await joinResponsePromise;
  assert(
    joinResponse.status() === 200,
    `Joining from invite returned HTTP ${joinResponse.status()}`,
  );
  session.token = await page.evaluate(() =>
    localStorage.getItem("schoolar_token"),
  );
  return joinResponse.json();
}

async function joinClass(session, code) {
  const { page } = session;
  await page.getByTestId("nav-classes").click();
  await page.getByTestId("join-class-button").click();
  await page.getByTestId("join-code-input").fill(code);
  const responsePromise = waitForApi(page, "/api/classes/join", "POST");
  await page.getByTestId("join-class-confirm").click();
  const response = await responsePromise;
  assert(
    response.status() === 200,
    `Joining class returned HTTP ${response.status()}`,
  );
  return response.json();
}

async function preflight() {
  const [root, health] = await Promise.all([
    fetch(appUrl("/"), { headers: { "user-agent": "casparel-beta-suite" } }),
    fetch(appUrl("/api/healthz"), {
      headers: { "user-agent": "casparel-beta-suite" },
    }),
  ]);
  assert(root.ok, `SPA preflight returned HTTP ${root.status}`);
  assert(health.ok, `Health preflight returned HTTP ${health.status}`);
  const body = await health.json().catch(() => null);
  assert(
    body?.schema?.state === "ready",
    "Health check did not report schema.state=ready",
  );
}

async function deleteCreated(token, pathname, method = "DELETE") {
  if (!token) return { ok: false, status: 0, detail: "No session token" };
  try {
    const response = await fetch(appUrl(pathname), {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    return {
      ok: response.ok,
      status: response.status,
      detail: response.ok ? "" : (await response.text()).slice(0, 200),
    };
  } catch (error) {
    return { ok: false, status: 0, detail: String(error) };
  }
}

async function cleanup() {
  if (config.keepAccounts) {
    for (const persona of sessions.keys()) {
      ledger.cleanup.push({
        persona,
        status: "SKIPPED",
        detail: "BETA_KEEP_ACCOUNTS=true",
      });
    }
    return;
  }
  const learnerToken = sessions.get("fresh learner")?.token;
  const educatorToken = sessions.get("mixed learner/educator")?.token;
  const hostToken = sessions.get("educator host")?.token;
  const records = [
    [
      "educator class",
      educatorToken,
      state.educatorClass?.id && `/api/classes/${state.educatorClass.id}`,
    ],
    [
      "host class",
      hostToken,
      state.hostClass?.id && `/api/classes/${state.hostClass.id}`,
    ],
    [
      "educator resource",
      educatorToken,
      state.educatorResource?.id && `/api/resources/${state.educatorResource.id}`,
    ],
    [
      "learning goal",
      learnerToken,
      state.goal?.id && `/api/learning-goals/${state.goal.id}`,
    ],
    [
      "resource list",
      learnerToken,
      state.list?.id && `/api/lists/${state.list.id}`,
    ],
    [
      "saved resource",
      learnerToken,
      state.resource?.id && `/api/resources/${state.resource.id}`,
    ],
  ];
  for (const [persona, token, pathname] of records) {
    if (!pathname) continue;
    const result = await deleteCreated(token, pathname);
    ledger.cleanup.push({
      persona,
      status: result.ok ? "REMOVED" : `FAILED HTTP ${result.status}`,
      detail: result.detail,
    });
  }
  for (const [persona, session] of sessions) {
    try {
      session.token = await session.page.evaluate(() =>
        localStorage.getItem("schoolar_token"),
      );
    } catch {
      // Keep the last token captured after registration/workspace switching.
    }
    const result = await deleteCreated(session.token, "/api/users/me");
    ledger.cleanup.push({
      persona: `${persona} account`,
      status: result.ok ? "ANONYMISED" : `FAILED HTTP ${result.status}`,
      detail: result.detail,
    });
  }
}

let browser;
let publicReviewContext;
let exitCode = 0;
try {
  await preflight();
  browser = await chromium.launch({
    ...launchOptions(),
    headless: config.headless,
  });
  const learner = await createSession("fresh learner", {
    width: 390,
    height: 844,
  });
  const educator = await createSession("mixed learner/educator", {
    width: 1280,
    height: 900,
  });
  const host = await createSession("educator host", {
    width: 1280,
    height: 900,
  });
  publicReviewContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "Europe/Istanbul",
  });
  const publicReviewPage = await publicReviewContext.newPage();
  monitorPage(publicReviewPage, "signed-out review recipient");

  await scenario(
    "AUTH-001",
    "three deterministic test accounts",
    learner.page,
    async () => {
      await register(learner, accounts.learner);
      await register(educator, accounts.educator);
      await register(host, accounts.host);
      return "Registered three isolated accounts through the UI; each received a real session.";
    },
  );

  let discoveredTitle = null;
  await scenario("SEARCH-002", "fresh learner", learner.page, async () => {
    await learner.page
      .getByTestId("search-input")
      .fill("AP Physics C mechanics");
    const responsePromise = waitForApi(
      learner.page,
      "/api/resources/discover",
      "GET",
      90_000,
    );
    await learner.page.getByTestId("search-input").press("Enter");
    const response = await responsePromise;
    assert(
      response.status() === 200,
      `Search returned HTTP ${response.status()}`,
    );
    const results = await response.json();
    assert(
      Array.isArray(results) && results.length > 0,
      "Search returned no catalog results",
    );
    const card = learner.page.getByTestId("discovered-resource-card").first();
    await card.waitFor({ state: "visible" });
    discoveredTitle = (
      await card.getByTestId("discovered-resource-title").textContent()
    )?.trim();
    assert(discoveredTitle, "The first search result had no visible title");
    return `Returned ${results.length} catalog result(s); first visible result was “${discoveredTitle}”.`;
  });

  await scenario("RES-004", "fresh learner", learner.page, async () => {
    const card = learner.page.getByTestId("discovered-resource-card").first();
    await card.getByTestId("research-discovered-resource").click();
    const responsePromise = waitForApi(
      learner.page,
      "/api/source-review",
      "GET",
    );
    await learner.page.getByTestId("unsaved-research-quick").click();
    const response = await responsePromise;
    assert(
      response.status() === 200,
      `Quick source check returned HTTP ${response.status()}`,
    );
    await learner.page.getByTestId("unsaved-source-research-result").waitFor();
    await learner.page.keyboard.press("Escape");
    return "Completed the non-AI source check before saving the discovered work.";
  });

  await scenario("SEARCH-024", "fresh learner", learner.page, async () => {
    const card = learner.page.getByTestId("discovered-resource-card").first();
    const responsePromise = waitForApi(learner.page, "/api/resources", "POST");
    await card.getByTestId("save-discovered-resource").click();
    const response = await responsePromise;
    assert(
      response.status() === 201,
      `Saving resource returned HTTP ${response.status()}`,
    );
    state.resource = await response.json();
    assert(state.resource?.id, "Saved resource response had no id");
    await learner.page.waitForTimeout(500);
    const remainingSave = learner.page
      .getByTestId("discovered-resource-card")
      .filter({ hasText: discoveredTitle })
      .getByTestId("save-discovered-resource");
    assert(
      (await remainingSave.count()) === 0 || (await remainingSave.isDisabled()),
      "The just-saved result still offered an enabled duplicate Save action",
    );
    await learner.page.reload({ waitUntil: "domcontentloaded" });
    await learner.page.getByTestId("resource-library-tab").click();
    const savedCards = learner.page
      .getByTestId("resource-card")
      .filter({ hasText: discoveredTitle });
    await savedCards.first().waitFor({ state: "visible" });
    assert(
      (await savedCards.count()) === 1,
      "The library contained more than one copy of the saved result",
    );
    return "Saved exactly one resource, removed the duplicate Save action, and verified persistence after reload.";
  });

  await scenario(
    "RES-001/004/SEARCH-026",
    "signed-out review recipient",
    publicReviewPage,
    async () => {
      assert(state.resource?.id, "Saved resource was unavailable for sharing");
      await learner.page
        .getByTestId("resource-card")
        .filter({ hasText: discoveredTitle })
        .click();
      await learner.page.getByTestId("review-source-button").click();
      await learner.page.getByTestId("mode-quick").click();
      await learner.page
        .getByTestId("copy-public-review-link")
        .waitFor({ state: "visible" });

      const publicPath = `/resources/${state.resource.id}?review=quick`;
      const reviewResponsePromise = waitForApi(
        publicReviewPage,
        new RegExp(`/api/resources/${state.resource.id}/source-review$`),
        "GET",
      );
      await publicReviewPage.goto(appUrl(publicPath), {
        waitUntil: "domcontentloaded",
      });
      const reviewResponse = await reviewResponsePromise;
      assert(
        reviewResponse.status() === 200,
        `Public quick review returned HTTP ${reviewResponse.status()}`,
      );
      await publicReviewPage
        .getByTestId("resource-facts")
        .waitFor({ state: "visible" });
      const recipientToken = await publicReviewPage.evaluate(() =>
        localStorage.getItem("schoolar_token"),
      );
      assert(!recipientToken, "Public review unexpectedly required a session");
      await learner.page.keyboard.press("Escape");
      return "Opened the exact resource and its quick credibility report in a fresh signed-out browser with no account token.";
    },
  );

  await scenario(
    "PLAT-001",
    "fresh learner at 390px",
    learner.page,
    async () => {
      const overflow = await learner.page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      );
      assert(
        !overflow,
        "The activation flow produced horizontal overflow at phone width",
      );
      return "Registration, search, source check, save, and reload remained usable at 390px.";
    },
  );

  await learner.page.setViewportSize({ width: 1280, height: 900 });
  await scenario("LIST-002/004", "fresh learner", learner.page, async () => {
    await learner.page.getByTestId("nav-lists").click();
    await learner.page.getByTestId("create-list-button").click();
    await learner.page.getByTestId("list-name-input").fill(names.list);
    const listResponsePromise = waitForApi(learner.page, "/api/lists", "POST");
    await learner.page.getByTestId("create-list-confirm").click();
    const listResponse = await listResponsePromise;
    assert(
      listResponse.status() === 201,
      `List creation returned HTTP ${listResponse.status()}`,
    );
    state.list = await listResponse.json();
    assert(state.list?.id, "Created list response had no id");

    await learner.page.getByTestId("nav-resources").click();
    await learner.page.getByTestId("resource-library-tab").click();
    await learner.page
      .getByTestId("resource-card")
      .filter({ hasText: discoveredTitle })
      .click();
    await learner.page.getByTestId("add-to-list-button").click();
    await selectOption(learner.page, "list-select", names.list);
    const itemResponsePromise = waitForApi(
      learner.page,
      new RegExp(`/api/lists/${state.list.id}/items$`),
      "POST",
    );
    await learner.page.getByTestId("add-to-list-confirm").click();
    const itemResponse = await itemResponsePromise;
    assert(
      itemResponse.ok(),
      `Adding list item returned HTTP ${itemResponse.status()}`,
    );

    await learner.page.getByTestId("nav-lists").click();
    await learner.page
      .getByTestId("list-card")
      .filter({ hasText: names.list })
      .click();
    await learner.page
      .getByTestId("list-item-card")
      .waitFor({ state: "visible" });
    return "Created a list, added the saved resource through its detail page, and reopened the persisted item.";
  });

  await scenario(
    "LIST-008/010",
    "signed-out list recipient",
    publicReviewPage,
    async () => {
      assert(state.list?.id, "Created list was unavailable for public sharing");
      const createShareResponsePromise = waitForApi(
        learner.page,
        new RegExp(`/api/lists/${state.list.id}/public-share$`),
        "POST",
      );
      await learner.page.getByTestId("create-public-list-link").click();
      const createShareResponse = await createShareResponsePromise;
      assert(
        [200, 201].includes(createShareResponse.status()),
        `Creating public list link returned HTTP ${createShareResponse.status()}`,
      );
      const publicShare = await createShareResponse.json();
      state.publicListToken = publicShare?.shareToken;
      assert(state.publicListToken, "Public list response had no share token");
      await learner.page
        .getByTestId("copy-public-list-link")
        .waitFor({ state: "visible" });

      const publicPath = `/lists/shared/${state.publicListToken}`;
      const publicListResponsePromise = waitForApi(
        publicReviewPage,
        new RegExp(`/api/lists/public/${state.publicListToken}$`),
        "GET",
      );
      await publicReviewPage.goto(appUrl(publicPath), {
        waitUntil: "domcontentloaded",
      });
      const publicListResponse = await publicListResponsePromise;
      assert(
        publicListResponse.status() === 200,
        `Opening public list returned HTTP ${publicListResponse.status()}`,
      );
      const sharedList = await publicListResponse.json();
      assert(sharedList?.name === names.list, "Public token opened the wrong list");
      assert(
        sharedList?.items?.length === 1 &&
          sharedList.items[0]?.resourceId === state.resource?.id,
        "Public list did not expose exactly the intended verified resource",
      );
      await publicReviewPage.getByTestId("public-list-page").waitFor();
      await publicReviewPage.getByTestId("public-list-item").waitFor();
      const recipientToken = await publicReviewPage.evaluate(() =>
        localStorage.getItem("schoolar_token"),
      );
      assert(!recipientToken, "Public list unexpectedly required a session");
      return "Created a public list link through the owner UI and opened exactly its verified resource in a fresh signed-out browser.";
    },
  );

  await scenario(
    "GOAL-001/DASH-003",
    "fresh learner",
    learner.page,
    async () => {
      const goalResponsePromise = waitForApi(
        learner.page,
        new RegExp(`/api/lists/${state.list.id}/learning-goal$`),
        "POST",
      );
      await learner.page.getByTestId("create-learning-path-button").click();
      const goalResponse = await goalResponsePromise;
      assert(
        goalResponse.ok(),
        `List-to-goal returned HTTP ${goalResponse.status()}`,
      );
      state.goal = await goalResponse.json();
      assert(state.goal?.id, "Learning-goal response had no id");
      await learner.page.waitForURL(/\/goals(?:\?|$)/);
      const goalCard = learner.page
        .getByTestId("goal-card")
        .filter({ hasText: names.list });
      await goalCard.waitFor({ state: "visible" });
      const patchPromise = waitForApi(
        learner.page,
        new RegExp(`/api/learning-goals/${state.goal.id}$`),
        "PATCH",
      );
      await goalCard.getByTestId("goal-step-toggle").first().click();
      const patchResponse = await patchPromise;
      assert(
        patchResponse.ok(),
        `Completing path step returned HTTP ${patchResponse.status()}`,
      );
      await learner.page.reload({ waitUntil: "domcontentloaded" });
      const persisted = learner.page
        .getByTestId("goal-card")
        .filter({ hasText: names.list });
      await persisted.waitFor({ state: "visible" });
      await persisted
        .getByRole("button", { name: /^Undo / })
        .first()
        .waitFor();
      return "Converted the ordered list into a goal and verified completed-step persistence after reload.";
    },
  );

  await scenario(
    "CLASS-001",
    "mixed learner/educator",
    educator.page,
    async () => {
      await switchWorkspace(educator, "Teacher");
      state.educatorClass = await createClass(educator, names.class);
      await openClass(educator, names.class);

      await switchWorkspace(host, "Teacher");
      state.hostClass = await createClass(host, names.hostClass);
      await openClass(host, names.hostClass);
      return "Two accounts enabled the educator workspace and created independent classes through the UI.";
    },
  );

  let educatorCode = null;
  let hostCode = null;
  await scenario(
    "CLASS-003",
    "two educator accounts",
    educator.page,
    async () => {
      educatorCode = await issueJoinCode(educator);
      hostCode = await issueJoinCode(host);
      return "Both class owners issued visible eight-character join codes.";
    },
  );

  await scenario(
    "AUTH-012/CLASS-004/005/022",
    "fresh learner",
    learner.page,
    async () => {
      assert(educatorCode, "Educator class code was unavailable");
      const joined = await joinClassFromSignedOutInvite(
        learner,
        educatorCode,
        accounts.learner,
      );
      assert(
        joined?.id === state.educatorClass?.id,
        "Learner joined the wrong class",
      );
      await learner.page.reload({ waitUntil: "domcontentloaded" });
      await learner.page
        .getByRole("heading", { name: names.class, exact: true })
        .waitFor();
      const duplicate = await joinClass(learner, educatorCode);
      assert(
        duplicate?.id === state.educatorClass?.id,
        "Duplicate join changed the class result",
      );
      return "Teacher invite link survived signed-out routing and login, prefilled the join code, joined the correct class, and remained idempotent on repeat.";
    },
  );

  await scenario(
    "ROLE-002",
    "mixed learner/educator",
    educator.page,
    async () => {
      assert(hostCode, "Host class code was unavailable");
      await switchWorkspace(educator, "Student");
      const joined = await joinClass(educator, hostCode);
      assert(
        joined?.id === state.hostClass?.id,
        "Mixed account joined the wrong host class",
      );
      await educator.page.getByTestId("nav-classes").click();
      await educator.page
        .getByTestId("class-card")
        .filter({ hasText: names.class })
        .waitFor();
      await educator.page
        .getByTestId("class-card")
        .filter({ hasText: names.hostClass })
        .waitFor();
      await educator.page.reload({ waitUntil: "domcontentloaded" });
      await educator.page
        .getByTestId("class-card")
        .filter({ hasText: names.class })
        .waitFor();
      await educator.page
        .getByTestId("class-card")
        .filter({ hasText: names.hostClass })
        .waitFor();
      return "One account owned one class, joined another as learner, and retained both relationships after reload.";
    },
  );

  await scenario(
    "CLASS-011",
    "mixed learner/educator",
    educator.page,
    async () => {
      await switchWorkspace(educator, "Teacher");
      await educator.page.getByTestId("nav-resources").click();
      await educator.page.getByTestId("submit-resource-button").click();
      const classResourceTitle = `Momentum source ${runSuffix}`;
      await educator.page
        .getByTestId("resource-title-input")
        .fill(classResourceTitle);
      await educator.page
        .getByTestId("resource-url-input")
        .fill(`https://example.invalid/casparel-beta-${runSuffix}`);
      await educator.page
        .getByTestId("resource-subject-input")
        .fill("Physics");
      await educator.page
        .getByTestId("resource-grade-input")
        .fill("Year 12");
      const resourceResponsePromise = waitForApi(
        educator.page,
        "/api/resources",
        "POST",
      );
      await educator.page.getByTestId("submit-resource-confirm").click();
      const resourceResponse = await resourceResponsePromise;
      assert(
        resourceResponse.status() === 201,
        `Creating assignment resource returned HTTP ${resourceResponse.status()}`,
      );
      state.educatorResource = await resourceResponse.json();
      await educator.page.getByTestId("resource-library-tab").click();
      const resourceCard = educator.page
        .getByTestId("resource-card")
        .filter({ hasText: classResourceTitle });
      await resourceCard.waitFor({ state: "visible" });
      await resourceCard.getByTestId("assign-library-resource").click();
      await selectOption(educator.page, "assign-class-select", names.class);
      const classResourceResponsePromise = waitForApi(
        educator.page,
        new RegExp(`/api/classes/${state.educatorClass.id}/assign$`),
        "POST",
      );
      await educator.page.getByTestId("assign-to-class-confirm").click();
      const classResourceResponse = await classResourceResponsePromise;
      assert(
        classResourceResponse.ok(),
        `Assigning class resource returned HTTP ${classResourceResponse.status()}`,
      );

      await openClass(educator, names.class);
      await educator.page.getByTestId("class-tab-assignments").click();
      await educator.page.getByTestId("assign-work-button").click();
      await educator.page
        .getByTestId("assignment-title-input")
        .fill(names.assignment);
      await educator.page
        .getByTestId("assignment-instructions-input")
        .fill("Write a two-sentence explanation and cite the class source.");
      await selectOption(
        educator.page,
        "assignment-link-type",
        "Class resource",
      );
      await selectOption(
        educator.page,
        "assignment-linked-item",
        classResourceTitle,
      );
      const responsePromise = waitForApi(
        educator.page,
        new RegExp(`/api/classes/${state.educatorClass.id}/assignments$`),
        "POST",
      );
      await educator.page.getByTestId("publish-assignment-button").click();
      const response = await responsePromise;
      assert(
        response.status() === 201,
        `Publishing assignment returned HTTP ${response.status()}`,
      );
      state.assignment = await response.json();
      await educator.page
        .getByTestId("assignment-card")
        .filter({ hasText: names.assignment })
        .waitFor();
      return "Created a source, assigned it to the class, and published linked class work through the teacher workspace.";
    },
  );

  await scenario(
    "CLASS-013",
    "learner and educator sessions",
    learner.page,
    async () => {
      await openClass(learner, names.class);
      await learner.page.getByTestId("class-tab-assignments").click();
      const assignmentCard = learner.page
        .getByTestId("assignment-card")
        .filter({ hasText: names.assignment });
      await assignmentCard.waitFor({ state: "visible" });
      const responsePromise = waitForApi(
        learner.page,
        new RegExp(`/api/assignments/${state.assignment.id}/completion$`),
        "PATCH",
      );
      await assignmentCard.getByTestId("assignment-completion-toggle").click();
      const response = await responsePromise;
      assert(
        response.ok(),
        `Completing assignment returned HTTP ${response.status()}`,
      );
      await learner.page.reload({ waitUntil: "domcontentloaded" });
      await learner.page.getByTestId("class-tab-assignments").click();
      await learner.page
        .getByTestId("assignment-card")
        .filter({ hasText: names.assignment })
        .getByTitle("Mark incomplete")
        .waitFor();

      await educator.page.reload({ waitUntil: "domcontentloaded" });
      await educator.page.getByTestId("class-tab-assignments").click();
      await educator.page
        .getByTestId("assignment-card")
        .filter({ hasText: names.assignment })
        .getByText("100% complete", { exact: true })
        .waitFor({ timeout: 30_000 });
      return "Learner completion persisted after reload and appeared as 100% complete in the educator session.";
    },
  );
} catch (error) {
  exitCode = 1;
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Beta suite stopped: ${detail}`);
  if (!ledger.results.length) {
    addLedgerResult(ledger, {
      id: "ENV-001",
      persona: "test environment",
      status: "BLOCKED-EXTERNAL",
      durationMs: 0,
      detail,
      evidence: [],
    });
  }
} finally {
  if (browser) {
    await cleanup();
    for (const session of sessions.values()) {
      await session.context.close().catch(() => undefined);
    }
    await publicReviewContext?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
  await Promise.allSettled([...pendingNetworkReads]);
  const networkPath = path.join(config.artifactDir, "api-network.json");
  fs.writeFileSync(networkPath, `${JSON.stringify(apiNetwork, null, 2)}\n`);
  for (const result of ledger.results) result.evidence.push(networkPath);
  if (
    ledger.results.some((result) => result.status !== "PASS") ||
    ledger.unexpectedConsoleErrors.length ||
    ledger.unexpectedApiErrors.length ||
    ledger.cleanup.some((item) => item.status.startsWith("FAILED"))
  ) {
    exitCode = 1;
  }
  const paths = writeLedger(ledger, config.artifactDir);
  console.log(`JSON ledger: ${paths.jsonPath}`);
  console.log(`Markdown ledger: ${paths.markdownPath}`);
}

process.exitCode = exitCode;
