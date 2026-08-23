#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Smoke Check.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Drives the real smoke-check against fake origins.
 *
 * The check has to make a judgement no other test covers: telling a broken
 * RELEASE apart from a broken HOST. casparel.com returned a Hostinger edge 503
 * for ~35 minutes with a byte-identical server bundle, which marked a good
 * release failed; the opposite mistake - excusing real breakage as "probably
 * the host" - would be far worse, so every case here pins the exact verdict.
 *
 * Timing is asserted too, not just the exit code: the extended host window must
 * only apply where the verdict is still open. A release that provably did not
 * come up has to fail immediately rather than waiting out the long window.
 */
import http from "node:http";
import { spawn } from "node:child_process";

const SCRIPT = "/home/user/casparel/scripts/smoke-check.mjs";

function server(port, handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(port, () => resolve(s));
  });
}

const edge503 = (req, res) => {
  res.writeHead(503, { "content-type": "text/html" });
  res.end("<html><body><h1>503</h1><p>The server is temporarily busy</p></body></html>");
};

// The app is up and correct.
const healthy = (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  if (p === "/api/healthz")
    return res.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ status: "ok", schema: { state: "ready" } }));
  if (p === "/api/resources")
    return res.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]));
  if (p === "/api/users/me")
    return res.writeHead(401, { "content-type": "application/json" })
      .end(JSON.stringify({ error: "Authentication required" }));
  res.writeHead(200, { "content-type": "text/html" })
    .end('<html><head><title>Casparel</title></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>');
};

// The app answers, but its database is broken: a real release fault.
const brokenRelease = (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  if (p === "/api/healthz")
    return res.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ status: "degraded", schema: { state: "failed" } }));
  if (p.startsWith("/api/"))
    return res.writeHead(500, { "content-type": "application/json" })
      .end(JSON.stringify({ error: "Internal server error" }));
  res.writeHead(200, { "content-type": "text/html" })
    .end('<html><head><title>Casparel</title></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>');
};

function run(port, baseline) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("node", [SCRIPT, `http://127.0.0.1:${port}`], {
      env: {
        ...process.env,
        SMOKE_TIMEOUT_MS: "3000",
        SMOKE_HOST_TIMEOUT_MS: "12000",
        SMOKE_REQUEST_MS: "2000",
        SMOKE_BASELINE_REACHABLE: baseline,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    child.on("exit", (code) =>
      resolve({ code, ms: Date.now() - started, out }),
    );
  });
}

let failed = 0;
const cases = [
  ["healthy release, baseline true", 5301, healthy, "true", 0],
  ["broken release (500s), baseline true", 5302, brokenRelease, "true", 1],
  ["edge 503, baseline false (host was already dark)", 5303, edge503, "false", 75],
  ["edge 503, baseline true (site WAS up -> release fault)", 5304, edge503, "true", 1],
  ["edge 503, baseline unknown", 5305, edge503, "", 1],
];

for (const [name, port, handler, baseline, expected] of cases) {
  const s = await server(port, handler);
  const { code, ms } = await run(port, baseline);
  const ok = code === expected;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name.padEnd(50)} exit=${String(code).padEnd(3)} (want ${expected})  ${(ms / 1000).toFixed(1)}s`,
  );
  s.close();
}

console.log(
  failed === 0
    ? `\nAll ${cases.length} smoke-check verdicts correct.`
    : `\n${failed} smoke-check verdict(s) wrong.`,
);
process.exit(failed === 0 ? 0 : 1);
