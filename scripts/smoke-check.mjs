#!/usr/bin/env node
/**
 * Asks the deployed site whether it actually works.
 *
 * The CI gate checks the build before it ships. Nothing checked it afterwards,
 * so on the day the database went unreachable, and again when a connection
 * string was wrong, the deploy reported success while every data-backed page
 * returned 500. Both times the person who noticed was the user, hours later.
 *
 * These are the checks that would have caught each of them:
 *  • the SPA is served at all,
 *  • /healthz reports the schema ready, which is the app's own answer to
 *    "can I reach my database and did my migrations apply",
 *  • a real data endpoint returns a real list rather than an error body, and
 *  • an authenticated route answers 401 rather than 500, which distinguishes
 *    "auth is working" from "everything is broken".
 *
 * Usage:
 *   node scripts/smoke-check.mjs [baseUrl]
 *   SMOKE_BASE_URL=https://casparel.com node scripts/smoke-check.mjs
 *
 * Exits non-zero when the site is not healthy, so a deploy job fails loudly
 * instead of going green over a broken release.
 */

const BASE = (
  process.argv[2] ??
  process.env.SMOKE_BASE_URL ??
  "https://casparel.com"
).replace(/\/+$/, "");

// A Passenger restart takes a little while, and the first request after it
// pays cold-start cost, so the run is given time to become healthy before it
// is called a failure.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 180_000);
const RETRY_DELAY_MS = Number(process.env.SMOKE_RETRY_MS ?? 10_000);
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_MS ?? 30_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(BASE + path, {
      signal: controller.signal,
      headers: { "user-agent": "casparel-smoke-check" },
    });
    const text = await response.text();
    return { status: response.status, text };
  } catch (error) {
    return { status: 0, text: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Collapse a response body to one readable line for the log. */
function summarise(text, max = 110) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Each check returns { ok, detail }. Detail is shown either way, because a
 * passing run that prints what it saw is far easier to trust later than a
 * bare tick.
 */
const CHECKS = [
  {
    name: "SPA is served",
    async run() {
      const { status, text } = await get("/");
      return {
        ok: status === 200 && text.includes("<div id=\"root\""),
        detail: `HTTP ${status}, ${text.length} bytes`,
      };
    },
  },
  {
    name: "database reachable and schema applied",
    async run() {
      const { status, text } = await get("/api/healthz");
      const body = parse(text);
      const schema = body?.schema;
      return {
        ok: status === 200 && schema?.state === "ready",
        detail:
          schema == null
            ? `HTTP ${status}, ${summarise(text)}`
            : `state=${schema.state}${schema.error ? ` error=${schema.error}` : ""}${
                schema.hint ? ` hint=${schema.hint}` : ""
              }`,
      };
    },
  },
  {
    name: "resource listing returns data",
    async run() {
      const { status, text } = await get("/api/resources?limit=3");
      const body = parse(text);
      return {
        ok: status === 200 && Array.isArray(body),
        detail: Array.isArray(body)
          ? `HTTP ${status}, ${body.length} row(s)`
          : `HTTP ${status}, ${summarise(text)}`,
      };
    },
  },
  {
    name: "authenticated route rejects cleanly",
    async run() {
      // 401 is the healthy answer here. A 500 means the failure is deeper than
      // authentication, which is exactly what a broken database looked like.
      const { status, text } = await get("/api/users/me");
      return { ok: status === 401, detail: `HTTP ${status} ${summarise(text, 80)}` };
    },
  },
];

async function runAll() {
  const results = [];
  for (const check of CHECKS) {
    results.push({ name: check.name, ...(await check.run()) });
  }
  return results;
}

const deadline = Date.now() + TIMEOUT_MS;
let results = [];
let attempt = 0;

while (Date.now() < deadline) {
  attempt += 1;
  results = await runAll();
  if (results.every((r) => r.ok)) break;

  const remaining = deadline - Date.now();
  if (remaining <= RETRY_DELAY_MS) break;
  const failing = results.filter((r) => !r.ok).map((r) => r.name);
  console.log(
    `attempt ${attempt}: waiting on ${failing.join(", ")} ` +
      `(${Math.round(remaining / 1000)}s left)`,
  );
  await sleep(RETRY_DELAY_MS);
}

console.log(`\nSmoke check against ${BASE}`);
for (const { name, ok, detail } of results) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name} — ${detail}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(
    `\n${failed.length} check(s) failing after ${attempt} attempt(s). ` +
      `The deploy is live but not healthy.`,
  );
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
