/**
 * @fileOverview Verification role: exercises Purchase Errors.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A failed purchase is told apart from a purchase that has not failed.
 *
 * The mobile paywall reported every non-cancellation as "Something went wrong.
 * Please try again." Two of the cases underneath that are not failures:
 *
 *  • PAYMENT_PENDING is Ask to Buy or a bank's authentication step. The
 *    purchase is in flight and may complete minutes later; "try again" invites
 *    a second charge attempt for something already happening.
 *  • PRODUCT_ALREADY_PURCHASED means they have paid. Telling a paying customer
 *    that something went wrong, instead of restoring what they bought, is the
 *    worst message a payment flow can produce.
 *
 * The classifier lives in a module of its own, with no react-native import,
 * so it can be tested at all: `revenuecat.ts` reaches for `Platform` at module
 * scope and cannot be loaded off a device.
 */
import { describe, expect, it } from "vitest";
import { classifyPurchaseError, type PurchaseFailure } from "./purchase-errors";

/** RevenueCat reports the code by name on both platforms. */
const rc = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  message: `Purchase failed: ${code}`,
  ...extra,
});

describe("classifying a purchase failure", () => {
  it("treats a cancellation as a cancellation, however it is reported", () => {
    expect(classifyPurchaseError({ userCancelled: true })).toBe("cancelled");
    expect(classifyPurchaseError(rc("PURCHASE_CANCELLED_ERROR"))).toBe("cancelled");
  });

  it("knows a pending purchase is not a failed one", () => {
    expect(classifyPurchaseError(rc("PAYMENT_PENDING_ERROR"))).toBe("pending");
  });

  it("knows an already-owned product means restore, not retry", () => {
    expect(classifyPurchaseError(rc("PRODUCT_ALREADY_PURCHASED_ERROR"))).toBe(
      "already-owned",
    );
  });

  it("separates a locked-down device from a payment problem", () => {
    // School profiles and Screen Time switch purchasing off entirely, which
    // this product will meet often.
    expect(classifyPurchaseError(rc("PURCHASE_NOT_ALLOWED_ERROR"))).toBe(
      "not-allowed",
    );
  });

  it("separates the store, the network, and our own configuration", () => {
    const cases: Array<[string, PurchaseFailure]> = [
      ["STORE_PROBLEM_ERROR", "store-unavailable"],
      ["PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR", "store-unavailable"],
      ["NETWORK_ERROR", "network"],
      ["CONFIGURATION_ERROR", "configuration"],
      ["INVALID_CREDENTIALS_ERROR", "configuration"],
      ["RECEIPT_ALREADY_IN_USE_ERROR", "configuration"],
    ];
    for (const [code, expected] of cases) {
      expect(classifyPurchaseError(rc(code)), code).toBe(expected);
    }
  });

  it("reads the message when the code is missing", () => {
    // Some SDK versions and platforms surface the name in the message only.
    expect(
      classifyPurchaseError({ message: "Payment pending: awaiting approval" }),
    ).toBe("pending");
  });

  it("falls back to unknown rather than guessing", () => {
    expect(classifyPurchaseError(null)).toBe("unknown");
    expect(classifyPurchaseError("nope")).toBe("unknown");
    expect(classifyPurchaseError(new Error("something odd"))).toBe("unknown");
  });

  it("never calls a cancellation anything else", () => {
    // userCancelled wins outright: the SDK sets it alongside other codes, and
    // showing an alert to somebody who pressed Cancel is a bug users notice.
    expect(
      classifyPurchaseError({ userCancelled: true, code: "STORE_PROBLEM_ERROR" }),
    ).toBe("cancelled");
  });
});
