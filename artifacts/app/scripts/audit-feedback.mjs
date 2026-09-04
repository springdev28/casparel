#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Audit Feedback behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The sound and celebration layer, checked where it actually fails.
 *
 * Three of its invariants are invisible to type-checking and to every other
 * audit, and each one has a specific way of going wrong:
 *
 *  • Reduced motion. The kill-switch in index.css enumerates class names, so a
 *    new animation is covered only if someone remembered to list it. No other
 *    audit emulates the preference, so nothing catches the one that was
 *    forgotten.
 *  • Canvas size. The confetti canvas is a replaced element: `fixed inset-0`
 *    does not size it, because a replaced element with `width: auto` lays out
 *    at its intrinsic size -- which for a canvas is its backing store, in
 *    device pixels. On a 2x screen that is twice the viewport, and most of the
 *    celebration lands off the edge of the screen. It looks correct at 1x,
 *    which is what a developer machine usually reports.
 *  • Audio without a gesture. A suspended AudioContext does not discard what
 *    is scheduled on it: currentTime freezes, the nodes wait, and they all
 *    sound together whenever the context resumes. A cue raised by a failing
 *    request on page load must therefore be dropped, not queued, or the user's
 *    first click plays a pile-up. It must also never throw: the page audits
 *    fail on any uncaught exception.
 *
 * Usage:
 *   pnpm --filter @workspace/app run build
 *   node scripts/audit-feedback.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { launchOptions } from "./chromium.mjs";
import { serveBuild } from "./serve-build.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/public",
);
const PORT = 4415;
const server = serveBuild(ROOT, PORT);
await server.ready;
const base = `http://127.0.0.1:${PORT}`;

const failures = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` -- ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

const browser = await chromium.launch(launchOptions());

/** A page on the public route, with anything it logs or throws collected. */
async function open(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 900, height: 700 },
    deviceScaleFactor: 2,
    ...options,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  return { context, page, errors };
}

// The synthesizer is loaded by a dynamic import, so it is its own chunk. That
// is the point of the dynamic import -- a muted session, and the landing page,
// must not carry it -- so its absence is a regression, not a detail.
const assets = fs.readdirSync(path.join(ROOT, "assets"));
const synth = assets.find((file) => file.startsWith("sound-effects-"));
check("the synthesizer is a lazy chunk of its own", Boolean(synth), synth ?? "no sound-effects-*.js in the build");

// 1. The confetti canvas, on a 2x screen, laid out exactly like the overlay
//    lays it out.
{
  const { context, page, errors } = await open();
  const canvas = await page.evaluate(() => {
    const element = document.createElement("canvas");
    element.className = "pointer-events-none fixed inset-0 h-full w-full z-[60]";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.floor(window.innerWidth * dpr);
    element.height = Math.floor(window.innerHeight * dpr);
    document.body.appendChild(element);
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: box.width,
      height: box.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dpr,
      pointerEvents: style.pointerEvents,
      zIndex: Number(style.zIndex),
    };
  });
  check(
    "the confetti canvas covers the viewport, not its backing store",
    Math.abs(canvas.width - canvas.viewportWidth) < 1 &&
      Math.abs(canvas.height - canvas.viewportHeight) < 1,
    `${canvas.width}x${canvas.height} against a ${canvas.viewportWidth}x${canvas.viewportHeight} viewport at dpr ${canvas.dpr}`,
  );
  check("the confetti canvas does not take clicks", canvas.pointerEvents === "none");
  check(
    "the confetti canvas sits above the shell chrome",
    canvas.zIndex > 50,
    `z-index ${canvas.zIndex}`,
  );
  await context.close();
}

// 2. Every cue, with no user gesture behind it: silence, and no exception.
//    Then one with a gesture, which must run all the way through.
if (synth) {
  const { context, page, errors } = await open();
  const kinds = ["tick", "pop", "success", "error", "chime", "notify", "fanfare"];
  const played = await page.evaluate(
    async ([file, names]) => {
      const module = await import(`/assets/${file}`);
      for (const name of names) module.playTone(name);
      return typeof module.playTone === "function";
    },
    [synth, kinds],
  );
  check("every cue is callable before any gesture", played);
  check(
    "cues raised with no gesture do not throw",
    errors.length === 0,
    errors.join(" | "),
  );

  await page.evaluate(
    ([file]) => {
      const button = document.createElement("button");
      button.id = "audit-gesture";
      button.textContent = "gesture";
      button.style.cssText =
        "position:fixed;left:0;top:0;width:120px;height:40px;z-index:99999";
      button.addEventListener("click", async () => {
        const module = await import(`/assets/${file}`);
        module.playTone("fanfare");
        // Reported through the DOM rather than a global: this file is
        // type-checked, and a window property invented here is an error.
        button.dataset.played = "true";
      });
      document.body.appendChild(button);
    },
    [synth],
  );
  await page.click("#audit-gesture");
  await page.waitForFunction(
    () => document.getElementById("audit-gesture")?.dataset.played === "true",
    null,
    { timeout: 5000 },
  );
  check(
    "a cue behind a real gesture runs to completion",
    errors.length === 0,
    errors.join(" | "),
  );
  await context.close();
}

// 3. The kill-switch, from both sides: every feedback animation must stop
//    under the preference, and still run without it.
const ANIMATED = [
  ["feedback-pop", "casparel-pop"],
  ["feedback-shake", "casparel-shake"],
];

{
  const { context, page } = await open({ reducedMotion: "reduce" });
  const names = await page.evaluate((classes) => {
    const found = {};
    for (const [className] of classes) {
      const element = document.createElement("div");
      element.className = className;
      document.body.appendChild(element);
      found[className] = getComputedStyle(element).animationName;
    }
    return found;
  }, ANIMATED);
  for (const [className] of ANIMATED) {
    check(
      `.${className} stops under prefers-reduced-motion`,
      names[className] === "none",
      `animation-name ${names[className]}`,
    );
  }
  await context.close();
}

{
  const { context, page } = await open({ reducedMotion: "no-preference" });
  const names = await page.evaluate((classes) => {
    const found = {};
    for (const [className] of classes) {
      const element = document.createElement("div");
      element.className = className;
      document.body.appendChild(element);
      found[className] = getComputedStyle(element).animationName;
    }
    return found;
  }, ANIMATED);
  for (const [className, keyframes] of ANIMATED) {
    check(
      `.${className} animates when motion is allowed`,
      names[className] === keyframes,
      `animation-name ${names[className]}`,
    );
  }
  await context.close();
}

// 4. The setting defaults to on by being absent. A write on mount would also
//    trip audit-live-ui, which fails a read-only page that writes.
{
  const { context, page } = await open();
  const stored = await page.evaluate(() =>
    localStorage.getItem("schoolar_sound_effects"),
  );
  check(
    "no sound preference is written just by loading the app",
    stored === null,
    `schoolar_sound_effects = ${JSON.stringify(stored)}`,
  );
  await context.close();
}

await browser.close();
server.close();

console.log(
  failures.length === 0
    ? "\nPASS: the feedback layer holds its invariants"
    : `\nFAIL: ${failures.length} feedback invariant(s) broken`,
);
process.exit(failures.length === 0 ? 0 : 1);
