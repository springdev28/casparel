/**
 * @fileOverview Test role: locks the AdMob-to-RevenueCat value conversions.
 * System connection: protects the analytics boundary used by the Android
 * sponsored card without importing either native SDK into Vitest.
 */
import { describe, expect, it } from "vitest";
import { numericAdErrorCode, toRevenueCatPrecision } from "./ad-revenue";

describe("toRevenueCatPrecision", () => {
  it("maps every documented AdMob precision", () => {
    expect(toRevenueCatPrecision(0)).toBe("unknown");
    expect(toRevenueCatPrecision(1)).toBe("estimated");
    expect(toRevenueCatPrecision(2)).toBe("publisher_defined");
    expect(toRevenueCatPrecision(3)).toBe("exact");
  });

  it("fails unknown future values closed to unknown", () => {
    expect(toRevenueCatPrecision(99)).toBe("unknown");
  });
});

describe("numericAdErrorCode", () => {
  it("keeps integer codes and rejects descriptive SDK errors", () => {
    expect(numericAdErrorCode(3)).toBe(3);
    expect(numericAdErrorCode("7")).toBe(7);
    expect(numericAdErrorCode("googleMobileAds/no-fill")).toBeUndefined();
    expect(numericAdErrorCode(null)).toBeUndefined();
  });
});
