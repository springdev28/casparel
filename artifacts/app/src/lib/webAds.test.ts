import { describe, expect, it } from "vitest";
import { mayShowWebAd, pathAllowsWebAd, type WebAdEligibility } from "./webAds";

const eligible: WebAdEligibility = {
  configured: true,
  nativeShell: false,
  adsDisabled: false,
  canDisableAds: false,
  consent: "granted",
  pending: false,
};

describe("mayShowWebAd", () => {
  it("shows an ad to a consenting free reader on a configured deployment", () => {
    expect(mayShowWebAd(eligible)).toBe(true);
  });

  it("shows nothing when the deployment has no advertising configured", () => {
    expect(mayShowWebAd({ ...eligible, configured: false })).toBe(false);
  });

  it("never renders a second ad inside the Android shell", () => {
    expect(mayShowWebAd({ ...eligible, nativeShell: true })).toBe(false);
  });

  it("requires affirmative consent, not merely the absence of a refusal", () => {
    expect(mayShowWebAd({ ...eligible, consent: "unknown" })).toBe(false);
    expect(mayShowWebAd({ ...eligible, consent: "denied" })).toBe(false);
  });

  it("honours Disable ads for an account entitled to it", () => {
    expect(
      mayShowWebAd({ ...eligible, canDisableAds: true, adsDisabled: true }),
    ).toBe(false);
  });

  it("ignores the flag for an account not entitled to turn ads off", () => {
    // A Free or Plus account that once held Pro keeps the stored preference,
    // but it stops taking effect until they are entitled again.
    expect(
      mayShowWebAd({ ...eligible, canDisableAds: false, adsDisabled: true }),
    ).toBe(true);
  });

  it("shows nothing while the account's plan is still loading", () => {
    // Otherwise a paying Pro sees an ad for the moment before their plan
    // resolves, which is precisely what they are paying not to see.
    expect(mayShowWebAd({ ...eligible, pending: true })).toBe(false);
  });
});

describe("pathAllowsWebAd", () => {
  it("allows ads on ordinary content pages", () => {
    for (const path of ["/", "/resources", "/dashboard", "/catalog", "/lists", "/schedule"]) {
      expect(pathAllowsWebAd(path)).toBe(true);
    }
  });

  it("excludes editing-heavy, private and checkout screens", () => {
    for (const path of [
      "/settings",
      "/settings/appearance",
      "/profile",
      "/auth/login",
      "/plans",
      "/messages",
      "/messages/42",
      "/admin",
      "/canvas/7",
      "/canvases/7",
      "/classes/7",
      "/delete-account",
      "/reset-account",
      "/terms",
      "/privacy",
      "/support",
    ]) {
      expect(pathAllowsWebAd(path)).toBe(false);
    }
  });

  it("ignores a trailing slash when matching an excluded route", () => {
    expect(pathAllowsWebAd("/settings/")).toBe(false);
    expect(pathAllowsWebAd("/resources/")).toBe(true);
  });

  it("does not exclude a route that merely starts with the same letters", () => {
    expect(pathAllowsWebAd("/planshare")).toBe(true);
    expect(pathAllowsWebAd("/profiles-directory")).toBe(true);
  });
});
