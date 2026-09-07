import { afterEach, beforeEach, expect, it, vi } from "vitest";

class Script extends EventTarget {
  dataset: Record<string, string> = {};
  remove() {
    scripts.splice(scripts.indexOf(this), 1);
  }
}
let scripts: Script[];
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("VITE_ADSENSE_CLIENT_ID", "ca-pub-1234567890123456");
  vi.stubEnv("VITE_ADSENSE_SLOT_INLINE", "1234567890");
  scripts = [];
  vi.stubGlobal("document", {
    querySelector: () => scripts[0],
    createElement: () => new Script(),
    head: { appendChild: (script: Script) => scripts.push(script) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("shares one in-flight load and does not report ready before the script loads", async () => {
  const { loadAdSense } = await import("./webAds");
  const first = loadAdSense();
  expect(loadAdSense()).toBe(first);
  expect(scripts).toHaveLength(1);
  scripts[0].dispatchEvent(new Event("load"));
  expect(await first).toBe(true);
  expect(await loadAdSense()).toBe(true);
  expect(scripts).toHaveLength(1);
});

it("removes a failed script so a later placement can actually retry", async () => {
  const { loadAdSense } = await import("./webAds");
  const first = loadAdSense();
  const failed = scripts[0];
  failed.dispatchEvent(new Event("error"));
  expect(await first).toBe(false);
  const retry = loadAdSense();
  expect(scripts[0]).not.toBe(failed);
  scripts[0].dispatchEvent(new Event("load"));
  expect(await retry).toBe(true);
});

it("times out a stalled request rather than leaving the ad card loading forever", async () => {
  const { loadAdSense } = await import("./webAds");
  const result = loadAdSense();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await result).toBe(false);
  expect(scripts).toHaveLength(0);
});
