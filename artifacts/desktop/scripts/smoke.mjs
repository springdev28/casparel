#!/usr/bin/env node
/**
 * Launches the real desktop shell against a local stand-in for casparel.com
 * and checks the behaviours that are easy to get wrong and impossible to see
 * in a type check.
 *
 * Each case corresponds to a way the window could be lost or the origin pin
 * escaped:
 *   • a failed EMBED must not replace the whole app window with the offline
 *     page (did-fail-load fires for subframes too),
 *   • a failed MAIN FRAME must show the offline page,
 *   • a cross-origin server REDIRECT must not load inside the app frame,
 *   • a deep link handed to a cold start must become the first page.
 *
 * Run through `pnpm run smoke`; the wrapper supplies Xvfb on Linux and uses
 * the current desktop session on macOS/Windows.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const PORT = 4457;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const electronBinary =
  process.platform === "darwin"
    ? join(
        root,
        "node_modules",
        "electron",
        "dist",
        "Electron.app",
        "Contents",
        "MacOS",
        "Electron",
      )
    : process.platform === "win32"
      ? join(root, "node_modules", "electron", "dist", "electron.exe")
      : join(root, "node_modules", "electron", "dist", "electron");

const pages = {
  "/": `<html><body><h1>Casparel</h1>
        <iframe src="${ORIGIN}/dead-embed"></iframe></body></html>`,
  "/resources/123": "<html><body><h1>Resource 123</h1></body></html>",
  "/leaves": null, // 302 to another origin
};

const server = http.createServer((req, res) => {
  const path = new URL(req.url, ORIGIN).pathname;
  if (path === "/dead-embed") {
    // Kill the socket so the subframe load genuinely fails.
    req.socket.destroy();
    return;
  }
  if (path === "/leaves") {
    res.writeHead(302, { location: "https://example.com/elsewhere" });
    res.end();
    return;
  }
  const body = pages[path];
  if (body === undefined) {
    res.writeHead(404, { "content-type": "text/html" });
    res.end("<html><body>not found</body></html>");
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(body);
});
await new Promise((resolve) => server.listen(PORT, resolve));

// One directory for the whole run, not one per case: the cases that check
// what the shell REMEMBERS need state to survive between them. Isolated from
// the real profile either way, so running the suite no longer leaves a
// developer's own window size and zoom set to whatever a test wanted.
const userDataDir = fs.mkdtempSync(join(os.tmpdir(), "casparel-smoke-"));

function runCase(name, { deepLink, script }) {
  return new Promise((resolve) => {
    const args = [`--user-data-dir=${userDataDir}`, join(root, "dist", "main.js")];
    if (deepLink) args.push(deepLink);
    const child = spawn(electronBinary, args, {
      env: {
        ...process.env,
        CASPAREL_URL: ORIGIN,
        CASPAREL_SMOKE: script,
        ELECTRON_DISABLE_SANDBOX: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    /*
     * Kept rather than discarded, for the case where the shell never reports.
     * "NO RESULT" on its own says a launch produced no verdict but not why,
     * and the two ordinary reasons -- dist/ not compiled, and Electron's
     * binary never downloaded -- both announce themselves clearly on stderr.
     * Seven identical "NO RESULT" lines sent a reader looking for a bug in the
     * shell when the answer was one line the runner had thrown away.
     */
    child.stderr.on("data", (chunk) => (err += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 25_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ name, result: "NO RESULT", reason: error.message });
    });
    child.on("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("SMOKE:"));
      if (line) return resolve({ name, result: line.slice(6).trim() });
      const reason = err.trim().split("\n").filter(Boolean).pop();
      resolve({ name, result: "NO RESULT", reason });
    });
  });
}

const cases = [
  // First, because if this one fails the rest do not matter: a shell around
  // remote content with node integration is a way to run code on the user's
  // machine, and nothing else here would notice.
  ["the window is hardened against the page it loads", { script: "hardening" }],
  ["a dead embed leaves the app window intact", { script: "embed" }],
  ["a dead main frame shows the offline page", { script: "mainframe" }],
  ["a cross-origin redirect is refused", { script: "redirect" }],
  [
    "a cold-start deep link opens that page",
    { script: "deeplink", deepLink: "casparel://resources/123" },
  ],
  // These two are one test across two launches, which is the only way to run
  // it: the point is that the setting survives the process that made it.
  ["a zoom level is saved on close", { script: "zoom-set" }],
  ["a saved zoom level comes back", { script: "zoom-restore" }],
];

const expected = {
  "the window is hardened against the page it loads": "hardened",
  "a dead embed leaves the app window intact": "app-intact",
  "a dead main frame shows the offline page": "offline-page",
  "a cross-origin redirect is refused": "blocked",
  "a cold-start deep link opens that page": "/resources/123",
  "a zoom level is saved on close": "saved",
  "a saved zoom level comes back": "2",
};

let failed = 0;
for (const [name, options] of cases) {
  const { result, reason } = await runCase(name, options);
  const ok = result === expected[name];
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(46)} ${result}`);
  if (!ok && reason) console.log(`     ${reason}`);
}

server.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log(
  failed === 0
    ? `\nAll ${cases.length} desktop shell checks passed.`
    : `\n${failed} desktop shell check(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
