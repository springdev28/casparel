#!/usr/bin/env node
/**
 * Whether the built web app can actually be installed, and whether the
 * installed copy opens without a network.
 *
 * Installability is a property of the build output, not of the source: the
 * manifest is generated, the icons are generated from a drawing by a different
 * package, and the service worker is a file copied verbatim that the app's own
 * code never imports. Every one of those can be individually correct while the
 * result is not installable -- an icon the manifest names but the build does
 * not emit, a start URL outside the scope, a worker that throws on activation
 * -- and none of it is visible to a type check or to a test that imports a
 * module. So this drives the real build in a real browser and asks the browser.
 *
 * What is checked:
 *
 *   • the HTML shell points at a manifest, and the manifest parses
 *   • the manifest carries what a browser requires before it offers to
 *     install: a name, a start URL inside the scope, a standalone display
 *     mode, and both a 192px and a 512px icon
 *   • every icon the manifest names is really there, is really a PNG, and is
 *     really the size it claims -- checked by reading the PNG header, because
 *     a manifest saying 512x512 over a 192px file is exactly the kind of
 *     mistake that survives review
 *   • every URL the manifest offers (start URL, each shortcut) is inside the
 *     scope and is actually served
 *   • the service worker registers, activates and takes control
 *   • with the network cut, a navigation still returns the app rather than the
 *     browser's error page -- which is the entire reason to install it
 *   • the worker does not answer for the API, cached or otherwise
 *
 *   pnpm --filter @workspace/app run build   # dist/public must exist
 *   node artifacts/app/scripts/audit-installable.mjs
 *
 * Exit 0 all good, 1 the app is not installable as built, 75 the run could not
 * be performed.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchOptions } from "./chromium.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/public",
);
const EXIT_INCONCLUSIVE = 75;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.log(`FAIL ${label}${detail ? `\n     ${detail}` : ""}`);
  }
}

class Inconclusive extends Error {}

/**
 * The static host, standing in for the API server's production branch.
 *
 * Unknown paths fall through to index.html the way a SPA host does, with one
 * exception: /api/ answers 503 rather than HTML, so that a worker wrongly
 * caching API responses would be caught by this rather than hidden by it.
 */
function serve(dir) {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent((req.url || "/").split("?")[0]);
    if (requested.startsWith("/api/")) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end('{"error":"offline"}');
      return;
    }
    let file = path.join(dir, requested);
    if (
      !file.startsWith(dir) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      file = path.join(dir, "index.html");
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server)),
  );
}

/** Width and height from a PNG's IHDR, or null if it is not a PNG at all. */
function pngSize(bytes) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, "index.html"))) {
    throw new Inconclusive(
      `no build at ${ROOT}. Run: pnpm --filter @workspace/app run build`,
    );
  }

  const { chromium } = await import("playwright-core");
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;

  try {
    browser = await chromium.launch(launchOptions());
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });

    const manifestHref = await page.getAttribute(
      'link[rel="manifest"]',
      "href",
    );
    check("the page points at a web app manifest", Boolean(manifestHref));
    if (!manifestHref)
      throw new Inconclusive("nothing else can be checked without one");

    const manifestUrl = new URL(manifestHref, base).toString();
    const manifestResponse = await page.request.get(manifestUrl);
    check(
      "the manifest is served",
      manifestResponse.ok(),
      `${manifestUrl} -> HTTP ${manifestResponse.status()}`,
    );

    let manifest = null;
    try {
      manifest = JSON.parse(await manifestResponse.text());
    } catch (error) {
      check("the manifest is valid JSON", false, String(error));
      throw new Inconclusive("the manifest could not be parsed");
    }
    check("the manifest is valid JSON", true);

    // --- what a browser requires before it will offer to install ------------

    check(
      "the manifest names the app",
      Boolean(manifest.name || manifest.short_name),
      "neither name nor short_name is set",
    );
    check(
      "the app opens in its own window",
      [
        "standalone",
        "fullscreen",
        "minimal-ui",
        "window-controls-overlay",
      ].includes(manifest.display),
      `display is ${JSON.stringify(manifest.display)}`,
    );
    check(
      "installing is not deferred to a store listing",
      manifest.prefer_related_applications !== true,
      "prefer_related_applications is true, so the browser offers the store app instead",
    );

    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const declares = (size) =>
      icons.some((icon) =>
        String(icon.sizes ?? "")
          .split(/\s+/)
          .includes(`${size}x${size}`),
      );
    check("a 192px icon is declared", declares(192));
    check("a 512px icon is declared", declares(512));
    check(
      "a maskable icon is declared",
      icons.some((icon) =>
        String(icon.purpose ?? "")
          .split(/\s+/)
          .includes("maskable"),
      ),
      "without one, Android shrinks the icon inside a white circle",
    );

    // --- every icon really exists, and is really the declared size ----------

    for (const icon of icons) {
      const url = new URL(icon.src, manifestUrl).toString();
      const response = await page.request.get(url);
      if (!response.ok()) {
        check(`${icon.src} is served`, false, `HTTP ${response.status()}`);
        continue;
      }
      const size = pngSize(await response.body());
      const declared = String(icon.sizes ?? "").split(/\s+/)[0];
      check(
        `${icon.src} is a ${declared} PNG`,
        size !== null && `${size.width}x${size.height}` === declared,
        size === null
          ? "not a PNG"
          : `the file is ${size.width}x${size.height}`,
      );
    }

    // --- every URL the manifest offers is in scope and is served ------------

    const scope = new URL(manifest.scope ?? "/", base).toString();
    const offered = [
      ["start_url", manifest.start_url],
      ...(manifest.shortcuts ?? []).map((shortcut) => [
        `shortcut "${shortcut.name}"`,
        shortcut.url,
      ]),
    ];
    for (const [label, value] of offered) {
      if (!value) {
        check(`${label} is set`, false);
        continue;
      }
      const url = new URL(value, base).toString();
      check(
        `${label} is inside the app's scope`,
        url.startsWith(scope),
        `${url} is outside ${scope}, so opening it would leave the installed window`,
      );
      const response = await page.request.get(url);
      check(
        `${label} is served`,
        response.ok(),
        `${url} -> HTTP ${response.status()}`,
      );
    }

    // --- the service worker -------------------------------------------------

    /*
     * Registered here rather than left to the app, which deliberately skips
     * registration in an automated browser (see src/lib/service-worker.ts).
     * The subject of this check is the worker itself, so registering it
     * explicitly tests the file that ships rather than the guard around it.
     */
    const registration = await page.evaluate(async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await navigator.serviceWorker.ready;
        // Control arrives via clients.claim(), which lands a beat after ready.
        for (
          let waited = 0;
          waited < 50 && !navigator.serviceWorker.controller;
          waited += 1
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return {
          active: Boolean(reg.active),
          controlling: Boolean(navigator.serviceWorker.controller),
        };
      } catch (error) {
        return { error: String(error) };
      }
    });
    check(
      "the service worker registers and activates",
      registration.active === true,
      registration.error ?? "no active worker",
    );
    check(
      "the service worker takes control of the page",
      registration.controlling === true,
      "registered but not controlling, so it would serve nothing",
    );

    // Give the worker a page to cache before the network is taken away.
    await page.goto(`${base}/resources`, { waitUntil: "load" });
    await page.waitForTimeout(1500);

    // --- what the installed app does with no network ------------------------

    const apiOffline = await page.evaluate(async () => {
      try {
        const response = await fetch("/api/healthz");
        return { status: response.status };
      } catch (error) {
        return { error: String(error) };
      }
    });

    await context.setOffline(true);
    const offlinePage = await context.newPage();
    let offlineError = null;
    await offlinePage
      .goto(`${base}/resources`, { waitUntil: "domcontentloaded" })
      .catch((error) => {
        offlineError = String(error).split("\n")[0];
      });
    const offlineTitle = offlineError ? "" : await offlinePage.title();
    const offlineRoot = offlineError
      ? 0
      : await offlinePage.evaluate(
          () => document.querySelectorAll("#root").length,
        );

    check(
      "the app still opens with no network",
      offlineError === null && offlineRoot === 1,
      offlineError ??
        `no #root in the served document (title: ${offlineTitle})`,
    );

    /*
     * The API must fail offline rather than answer from a cache. A schedule
     * served from yesterday is a claim about the reader's day that nobody
     * made, and the app already has a screen for a request it could not make.
     */
    const apiWhileOffline = await offlinePage.evaluate(async () => {
      try {
        const response = await fetch("/api/healthz");
        return {
          status: response.status,
          body: (await response.text()).slice(0, 80),
        };
      } catch (error) {
        return { failed: String(error).slice(0, 80) };
      }
    });
    check(
      "the API is not answered from the cache",
      apiWhileOffline.failed !== undefined,
      `fetch returned HTTP ${apiWhileOffline.status}: ${apiWhileOffline.body}`,
    );
    check(
      "the API was reachable before the network was cut",
      apiOffline.status === 503,
      `expected the stand-in host's 503, got ${JSON.stringify(apiOffline)}`,
    );

    await context.setOffline(false);
    await context.close();
  } finally {
    await browser?.close().catch(() => {});
    server.close();
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(
      "The app as built cannot be installed, or cannot open offline.",
    );
    process.exit(1);
  }
  console.log("The web app is installable and opens without a network.");
}

main().catch((error) => {
  if (error instanceof Inconclusive) {
    console.error(`Could not run: ${error.message}`);
    process.exit(EXIT_INCONCLUSIVE);
  }
  console.error(error);
  process.exit(1);
});
