import { describe, expect, it } from "vitest";
import { isAppearanceMode, resolveAppearance } from "./appearance";

describe("resolveAppearance", () => {
  it("paints exactly what an explicit choice asks for, whatever the device says", () => {
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("light", false)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
    expect(resolveAppearance("dark", true)).toBe("dark");
  });

  it("follows the device when the choice is System", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
  });

  it("follows the device before anybody has chosen", () => {
    // null is what the account carries until the person picks something, and
    // undefined is what a not-yet-loaded preference looks like. Neither may
    // be read as "light": that would paint a dark phone bright on every
    // first load, which is the flash this whole mechanism exists to avoid.
    expect(resolveAppearance(null, true)).toBe("dark");
    expect(resolveAppearance(undefined, true)).toBe("dark");
    expect(resolveAppearance(null, false)).toBe("light");
  });
});

describe("isAppearanceMode", () => {
  it("accepts only the three real modes", () => {
    expect(isAppearanceMode("light")).toBe(true);
    expect(isAppearanceMode("dark")).toBe(true);
    expect(isAppearanceMode("system")).toBe(true);
  });

  it("rejects anything else, including a stale or tampered stored value", () => {
    for (const value of [null, undefined, "", "auto", "Dark", 1, {}]) {
      expect(isAppearanceMode(value)).toBe(false);
    }
  });
});
