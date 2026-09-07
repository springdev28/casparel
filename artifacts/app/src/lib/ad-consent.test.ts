import { afterEach, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllGlobals());

it("honours a choice for the current page when browser storage is blocked", async () => {
  vi.resetModules();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  });
  const { readAdConsent, writeAdConsent, subscribeToAdConsent } =
    await import("./ad-consent");
  const changed = vi.fn();
  const unsubscribe = subscribeToAdConsent(changed);
  expect(readAdConsent()).toBe("unknown");
  writeAdConsent("granted");
  expect(readAdConsent()).toBe("granted");
  writeAdConsent("denied");
  expect(readAdConsent()).toBe("denied");
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
});
