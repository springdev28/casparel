#!/usr/bin/env node
/**
 * Checks that a dead session actually ejects the user.
 *
 * The app used to gate private routes on the mere presence of a token in
 * localStorage, and nothing acted on a 401. So an expired or revoked session
 * kept the user inside the signed-in shell with every panel failing and no
 * route back to login - the token looked valid to the guard because the guard
 * never decoded it, and localStorage is not reactive so clearing it changed
 * nothing on screen.
 *
 * Three cases, because fixing one is easy and fixing one while breaking
 * another is easier: a valid session must NOT be ejected, an expired token
 * must be, and a token the server rejects must be.
 *
 * Usage:
 *   pnpm --filter @workspace/app run build
 *   node scripts/audit-session.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { installSession } from "./audit-fixtures.mjs";
import { launchOptions } from "./chromium.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/public");
const PORT = 4401;
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(ROOT, url.pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((ready) => {
  server.listen(PORT, () => ready(undefined));
});

const browser = await chromium.launch(launchOptions());

function expiredToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ userId: 1, role: "teacher", accountRole: "admin", exp: Date.now() - 60_000 })}.audit`;
}

/**
 * @param {string} label
 * @param {{ token?: string, api401?: boolean }} [options]
 */
async function visit(label, { token, api401 = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installSession(ctx);
  if (token !== undefined) {
    await ctx.addInitScript((t) => localStorage.setItem("schoolar_token", t), token);
  }
  if (api401) {
    await ctx.route("**/api/**", (route) => {
      const u = route.request().url();
      if (/\/auth\/(login|register)$/.test(u)) return route.continue();
      return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Authentication required"}' });
    });
  }
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const url = new URL(page.url()).pathname;
  const hasLoginForm = await page.locator('[data-testid="login-button"]').count();
  console.log(`${label.padEnd(34)} -> ${url.padEnd(16)} loginForm=${hasLoginForm > 0 ? "yes" : "no"}`);
  await ctx.close();
  return { url, hasLoginForm: hasLoginForm > 0 };
}

const valid = await visit("valid session");
const expired = await visit("expired token", { token: expiredToken() });
const revoked = await visit("valid token, server says 401", { api401: true });

await browser.close();
server.close();

const pass =
  valid.url === "/dashboard" && !valid.hasLoginForm &&
  expired.url === "/auth/login" && expired.hasLoginForm &&
  revoked.url === "/auth/login" && revoked.hasLoginForm;
console.log(pass ? "\nPASS: sessions behave correctly" : "\nFAIL");
process.exit(pass ? 0 : 1);
