#!/usr/bin/env node
/**
 * @fileOverview Repository tooling role: implements Smoke Check for workspace development, build, validation, or documentation.
 * System connection: invoked by package scripts or maintainers; it is not part of the end-user runtime bundle.
 */
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
 *   node scripts/smoke-check.mjs --probe [baseUrl]   (pre-deploy reading)
 *   SMOKE_BASE_URL=https://casparel.com node scripts/smoke-check.mjs
 *
 * Exit codes:
 *   0   the live site is healthy.
 *   1   the release is broken. The application answered — a 500 is an answer —
 *       or it went dark on a host that was answering before the upload.
 *   75  the release is UNVERIFIED: nothing answered from the application at
 *       any point, and the site was already unreachable before this release
 *       was uploaded, so the fault predates it. Not a pass. Re-run once the
 *       host is back.
 *
 * The 0/1 boundary never moves for a host outage: a release only ever reaches
 * 75 by failing every check, producing zero application responses for the
 * whole window, AND having been preceded by a site that was already down.
 */

import { appendFileSync } from "node:fs";

const ARGS = process.argv.slice(2);

// --probe takes one reading and reports whether the application answered,
// without judging the release. It is run before a deploy, so the check after
// the deploy knows what the site looked like beforehand.
const PROBE_ONLY = ARGS.includes("--probe");

const BASE = (
  ARGS.find((arg) => !arg.startsWith("--")) ??
  process.env.SMOKE_BASE_URL ??
  "https://casparel.com"
).replace(/\/+$/, "");

// A Passenger restart takes a little while, and the first request after it
// pays cold-start cost, so the run is given time to become healthy before it
// is called a failure.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 180_000);
const RETRY_DELAY_MS = Number(process.env.SMOKE_RETRY_MS ?? 10_000);
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_MS ?? 30_000);

// While nothing at all is answering, the site is either still restarting or
// the host's edge is down; both clear on their own, and this host's last edge
// outage ran for 35 minutes. So that one state gets a much longer window.
// It is only ever used when every check fails with zero application responses
// — a release that answers and answers wrongly still fails after TIMEOUT_MS.
const HOST_TIMEOUT_MS = Number(process.env.SMOKE_HOST_TIMEOUT_MS ?? 1_200_000);

// Written by the pre-deploy `--probe` run: "true" if the application answered
// before this release was uploaded, "false" if it did not, "" if no probe
// ran. Only an explicit "false" permits the host-fault verdict below.
const BASELINE_REACHABLE = (process.env.SMOKE_BASELINE_REACHABLE ?? "").trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The statuses a shared host's edge returns when it never reached the app.
// They are the only statuses that can mean "host", and only when the body did
// not come from us either.
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Did this response come from our application, or from the edge in front of
 * it? Everything the app emits is JSON or the built SPA; a Hostinger edge
 * error page is neither.
 *
 * This is the whole discriminator, and it is deliberately biased against
 * excuses: ANY application response — a 500 very much included — proves the
 * release is running and reachable, so every failing check from that point on
 * belongs to the release.
 */
function fromApplication(status, text) {
  if (status === 0) return false; // never connected, or timed out
  if (!GATEWAY_STATUSES.has(status)) return true; // 200, 401, 404, 500 … ours
  return parse(text) != null || text.includes('<div id="root"');
}

/** How many responses in this run demonstrably came from the application. */
let appResponses = 0;

async function get(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(BASE + path, {
      signal: controller.signal,
      headers: { "user-agent": "casparel-smoke-check" },
    });
    const text = await response.text();
    if (fromApplication(response.status, text)) appResponses += 1;
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

// ── Pre-deploy probe ───────────────────────────────────────────────────────
// Records whether the site answered, and nothing else. Deliberately exits 0
// whatever it finds: it must never be the thing that blocks a deploy, it only
// leaves behind the reading the post-deploy run needs.
if (PROBE_ONLY) {
  await get("/");
  await get("/api/healthz");
  const reachable = appResponses > 0;
  console.log(
    `probe ${BASE}: application ${reachable ? "answered" : "did not answer"}`,
  );
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `reachable=${reachable}\n`);
  }
  process.exit(0);
}

const deadline = Date.now() + TIMEOUT_MS;
const hostDeadline = Date.now() + HOST_TIMEOUT_MS;
let results = [];
let attempt = 0;
let blackout = false;

for (;;) {
  attempt += 1;
  const seenBefore = appResponses;
  results = await runAll();
  if (results.every((r) => r.ok)) break;

  // A blackout is every check failing with not one response from the
  // application on this attempt. Anything less is a release fault, and gets
  // the ordinary short window.
  blackout = results.every((r) => !r.ok) && appResponses === seenBefore;

  // The long window only buys time for a verdict that is still open, and a
  // host verdict additionally requires the baseline to say the site was
  // already dark. Gating the wait on the same condition as hostFault below
  // keeps a release that provably did not come up - baseline "true", the most
  // common serious deploy failure - from sitting here for twenty minutes to
  // deliver a failure that was decided on the first attempt.
  const remaining =
    (blackout && BASELINE_REACHABLE === "false" ? hostDeadline : deadline) -
    Date.now();
  if (remaining <= RETRY_DELAY_MS) break;
  const failing = results.filter((r) => !r.ok).map((r) => r.name);
  console.log(
    `attempt ${attempt}: waiting on ${failing.join(", ")} ` +
      `(${Math.round(remaining / 1000)}s left` +
      `${blackout ? ", nothing answering at all" : ""})`,
  );
  await sleep(RETRY_DELAY_MS);
}

console.log(`\nSmoke check against ${BASE}`);
for (const { name, ok, detail } of results) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
}

/**
 * Whether the www form of the site also works, reported and never enforced.
 *
 * People type www whatever the DNS says, and casparel.com answers it with a
 * 301 to https://www.casparel.com — which then fails to open at all, because
 * the certificate is issued for the bare name and does not list www among its
 * alternates. The redirect walks the visitor into a browser security warning.
 *
 * A warning rather than a check, deliberately. This is the hosting's TLS
 * configuration, not anything in the release being deployed, and a failing
 * check here would block every future deploy of perfectly good code until
 * somebody re-issued a certificate. What was actually wrong is that nothing
 * ever said so: the fault sat there unnoticed because every automated check
 * asked about the apex, which works.
 */
async function reportAlternateHostname() {
  let host;
  try {
    host = new URL(BASE).hostname;
  } catch {
    return;
  }
  // Only meaningful for a real registered name; www.localhost is not a thing.
  if (host.startsWith("www.") || !host.includes(".") || /^[\d.]+$/.test(host))
    return;

  const wwwUrl = `https://www.${host}/`;
  try {
    const response = await fetch(wwwUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "casparel-smoke-check" },
      redirect: "manual",
    });
    // Connecting is not working. A 503 still means a visitor typing www gets
    // nothing, and reporting the connection as a success because bytes came
    // back is how a broken hostname stays invisible.
    const served = response.status < 400;
    console.log(
      `${served ? "ok  " : "warn"} www ${served ? "reachable" : "answers badly"}: ` +
        `${wwwUrl} HTTP ${response.status}`,
    );
    if (!served) {
      console.log(
        `::warning title=www answers ${response.status}::${wwwUrl} is reachable but ` +
          `does not serve the site. The deploy is unaffected.`,
      );
    }
  } catch (error) {
    const code = error?.cause?.code ?? error?.code ?? "";
    const certFault = String(code).includes("ALTNAME") || String(code).includes("CERT");
    console.log(
      `warn www is broken: ${wwwUrl} — ${code || error?.message || error}` +
        (certFault
          ? `\n     the certificate does not list www, so http://www.${host} ` +
            `redirects visitors into a security warning. Re-issue it covering ` +
            `both ${host} and www.${host}.`
          : ""),
    );
    // Surfaced in the Actions UI without touching the job's result.
    console.log(
      `::warning title=www is unreachable::${wwwUrl} fails to open (${code || "see log"}). ` +
        `The deploy is unaffected; the certificate or DNS needs attention.`,
    );
  }
}

await reportAlternateHostname();

const failed = results.filter((r) => !r.ok);
if (!failed.length) {
  console.log(`\nAll ${results.length} checks passed.`);
  process.exit(0);
}

// The host verdict needs all four of these, and nothing weaker will do:
//  • every check failed,
//  • not one response in the entire run came from the application,
//  • the site was already not answering BEFORE this release was uploaded, so
//    the blackout predates us, and
//  • it stayed that way for the whole extended window.
// A release that boots and misbehaves answers, and falls through to exit 1.
// A release that cannot boot at all does not answer — but the site answered
// before the upload, so the baseline refuses to excuse it, and it also falls
// through to exit 1. An unknown baseline counts as "not the host". This path
// cannot turn any failure into a pass; its best outcome is still a red job.
const hostFault =
  blackout && appResponses === 0 && BASELINE_REACHABLE === "false";

if (hostFault) {
  console.log(
    `\nRELEASE UNVERIFIED after ${attempt} attempt(s). Nothing answered from ` +
      `the application, and ${BASE} was already unreachable before this ` +
      `release was uploaded, so the fault is the host's and predates the ` +
      `deploy. This says nothing good about the release either — re-run this ` +
      `job once the site is answering.`,
  );
  console.log(
    `::error title=Release unverified (host unreachable)::${BASE} never ` +
      `answered from the application, before or after the upload. Re-run the ` +
      `deploy to verify this release.`,
  );
  process.exit(75); // EX_TEMPFAIL: not a pass, and not a verdict on the release
}

console.log(
  `\n${failed.length} check(s) failing after ${attempt} attempt(s). ` +
    (appResponses === 0
      ? BASELINE_REACHABLE === "true"
        ? `Nothing answered from the application, and the site WAS answering ` +
          `before this upload: this release did not come up.`
        : `Nothing answered from the application, and there is no record of ` +
          `the site being down beforehand, so this is not written off as a ` +
          `host outage.`
      : `The deploy is live but not healthy.`),
);
process.exit(1);
