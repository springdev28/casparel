/**
 * The device and the server have to agree about what somebody bought.
 *
 * Two files decide this, in two packages, with no shared code between them:
 * the app resolves a tier from RevenueCat's customer info to draw the badge
 * and unlock the screens, and the server resolves a plan from the webhook's
 * entitlement identifiers to set the allowances. They are written to be in
 * lockstep and are kept that way by hand.
 *
 * The failure is quiet and expensive. Add a tier to the paywall and forget the
 * webhook, and someone pays, sees the upgrade confirmed on their phone, and
 * gets a free account's allowances from the server -- for as long as it takes
 * somebody to notice and complain. Nothing throws. Nothing goes red. The
 * purchase succeeded.
 *
 * So: same identifiers on both sides, and resolved in the same order. Order
 * matters as much as membership, because a person can hold several at once --
 * a school licence on top of a personal subscription -- and the two sides
 * disagreeing about which wins is the same bug wearing a hat.
 *
 * Read as text because the app is another package and does not build here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(resolve(here, "entitlements.ts"), "utf8");
const mobile = readFileSync(
  resolve(here, "../../../mobile/utils/revenuecat.ts"),
  "utf8",
);

/** `export const X_ENTITLEMENT = 'value'` on either side. */
function declaredEntitlements(source: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of source.matchAll(
    /export const (\w*ENTITLEMENT)\s*=\s*['"]([^'"]+)['"]/g,
  )) {
    found[match[1]] = match[2];
  }
  return found;
}

/** The constants a resolution function consults, in the order it consults them. */
function precedence(source: string, functionName: string): string[] {
  const start = source.indexOf(`function ${functionName}`);
  expect(start, `${functionName} is gone`).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("\n}", start));
  return [...body.matchAll(/(\w*_ENTITLEMENT)\b/g)].map((m) => m[1]);
}

describe("the app and the server agree about entitlements", () => {
  const serverIds = declaredEntitlements(server);
  const mobileIds = declaredEntitlements(mobile);

  it("finds the declarations to compare", () => {
    // A rename or a move would otherwise make every assertion below vacuous.
    expect(Object.keys(serverIds).length).toBeGreaterThanOrEqual(7);
    expect(Object.keys(mobileIds).length).toBeGreaterThanOrEqual(7);
  });

  it("knows the same entitlements by the same names", () => {
    expect(Object.keys(mobileIds).sort()).toEqual(Object.keys(serverIds).sort());
  });

  it("spells every identifier the same way", () => {
    // A typo here is invisible until a real purchase fails to unlock anything:
    // RevenueCat matches these strings exactly.
    for (const [name, value] of Object.entries(serverIds)) {
      expect(mobileIds[name], `${name} differs between app and server`).toBe(value);
    }
  });

  it("resolves a stack of entitlements in the same order", () => {
    expect(precedence(mobile, "subscriptionTier")).toEqual(
      precedence(server, "planForEntitlementIds"),
    );
  });

  it("treats the legacy identifier as Pro on both sides", () => {
    // Kept for buyers from before the tiers were split by role. Dropping it on
    // one side silently demotes people who are still paying.
    expect(precedence(server, "planForEntitlementIds")).toContain(
      "PREMIUM_ENTITLEMENT",
    );
    expect(precedence(mobile, "subscriptionTier")).toContain(
      "PREMIUM_ENTITLEMENT",
    );
  });
});
