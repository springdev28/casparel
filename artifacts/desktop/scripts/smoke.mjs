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
import http from "node:http";
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

function runCase(name, { deepLink, script }) {
  return new Promise((resolve) => {
    const args = [join(root, "dist", "main.js")];
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
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", () => {});
    const timer = setTimeout(() => child.kill("SIGKILL"), 25_000);
    child.on("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("SMOKE:"));
      resolve({ name, result: line ? line.slice(6).trim() : "NO RESULT" });
    });
  });
}

const cases = [
  ["a dead embed leaves the app window intact", { script: "embed" }],
  ["a dead main frame shows the offline page", { script: "mainframe" }],
  ["a cross-origin redirect is refused", { script: "redirect" }],
  [
    "a cold-start deep link opens that page",
    { script: "deeplink", deepLink: "casparel://resources/123" },
  ],
];

const expected = {
  "a dead embed leaves the app window intact": "app-intact",
  "a dead main frame shows the offline page": "offline-page",
  "a cross-origin redirect is refused": "blocked",
  "a cold-start deep link opens that page": "/resources/123",
};

let failed = 0;
for (const [name, options] of cases) {
  const { result } = await runCase(name, options);
  const ok = result === expected[name];
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(46)} ${result}`);
}

server.close();
console.log(
  failed === 0
    ? `\nAll ${cases.length} desktop shell checks passed.`
    : `\n${failed} desktop shell check(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
