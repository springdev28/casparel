import { describe, expect, it } from "vitest";
import type { Package, Purchases } from "@revenuecat/purchases-js";
import {
  baseWebProductId,
  fetchWebSubscriptionState,
  purchaseWebPackage,
  tierForWebPackage,
  webPackageAction,
  type WebPlanContext,
  type WebPlanPackage,
} from "./webBilling";

function pkg(id: string, tier: "plus" | "pro", period: "monthly" | "annual"): WebPlanPackage {
  return { id, tier, period, price: "$9.99", raw: {} as Package };
}

const PLUS_MONTHLY = pkg("plus_monthly", "plus", "monthly");
const PLUS_YEARLY = pkg("plus_yearly", "plus", "annual");
const PRO_MONTHLY = pkg("pro_monthly", "pro", "monthly");
const PRO_YEARLY = pkg("pro_yearly", "pro", "annual");
const ALL = [PLUS_MONTHLY, PLUS_YEARLY, PRO_MONTHLY, PRO_YEARLY];

const base: WebPlanContext = {
  signedIn: true,
  isAdmin: false,
  pending: false,
  currentLevel: "free",
  institutional: false,
  subscription: null,
};

describe("webPackageAction", () => {
  it("offers every package to visitors and free accounts", () => {
    for (const candidate of ALL) {
      expect(webPackageAction(candidate, { ...base, signedIn: false })).toBe("subscribe");
      expect(webPackageAction(candidate, base)).toBe("subscribe");
    }
  });

  it("sells nothing to administrators or institutional accounts", () => {
    expect(webPackageAction(PRO_YEARLY, { ...base, isAdmin: true })).toBe("hidden");
    expect(
      webPackageAction(PRO_YEARLY, {
        ...base,
        currentLevel: "pro",
        institutional: true,
      }),
    ).toBe("hidden");
  });

  it("sells nothing until the server has said which plan the account is on", () => {
    expect(webPackageAction(PLUS_MONTHLY, { ...base, pending: true })).toBe("hidden");
  });

  it("lets a web-billed Plus subscriber switch tier or billing period", () => {
    const context: WebPlanContext = {
      ...base,
      currentLevel: "plus",
      subscription: {
        activeProductIds: ["casparel_plus_monthly"],
        entitlementStore: "web",
        manageUrl: "https://billing.example/manage",
      },
    };
    expect(webPackageAction(PLUS_MONTHLY, context)).toBe("current");
    expect(webPackageAction(PLUS_YEARLY, context)).toBe("switch-period");
    expect(webPackageAction(PRO_MONTHLY, context)).toBe("switch-tier");
    expect(webPackageAction(PRO_YEARLY, context)).toBe("switch-tier");
  });

  it("points a Play/App Store subscriber at their store instead of double-billing", () => {
    const context: WebPlanContext = {
      ...base,
      currentLevel: "pro",
      subscription: {
        activeProductIds: ["casparel_pro_monthly"],
        entitlementStore: "app-store",
        manageUrl: "https://play.google.com/store/account/subscriptions",
      },
    };
    for (const candidate of ALL) {
      expect(webPackageAction(candidate, context)).toBe("app-managed");
    }
    // Paid, but the customer record is unavailable: never offer a second
    // subscription on a guess.
    expect(
      webPackageAction(PRO_YEARLY, { ...base, currentLevel: "pro", subscription: null }),
    ).toBe("app-managed");
  });
});

describe("product identity", () => {
  it("strips the Google Play base plan and accepts the bare id", () => {
    expect(baseWebProductId("casparel_plus_monthly:monthly")).toBe("casparel_plus_monthly");
    expect(baseWebProductId("casparel_plus_monthly")).toBe("casparel_plus_monthly");
  });

  it("resolves only the exact configured package/product pairs", () => {
    expect(
      tierForWebPackage({
        identifier: "plus_monthly",
        webBillingProduct: { identifier: "casparel_plus_monthly" },
      } as unknown as Package),
    ).toBe("plus");
    expect(
      tierForWebPackage({
        identifier: "plus_monthly",
        webBillingProduct: { identifier: "some_other_product" },
      } as unknown as Package),
    ).toBeNull();
  });
});

describe("fetchWebSubscriptionState", () => {
  function purchasesWith(info: unknown): Purchases {
    return { getCustomerInfo: async () => info } as unknown as Purchases;
  }

  it("reads active products, entitlement store, and the manage link", async () => {
    const state = await fetchWebSubscriptionState(
      purchasesWith({
        activeSubscriptions: new Set(["casparel_plus_yearly"]),
        entitlements: {
          active: {
            plus: { identifier: "plus", isActive: true, store: "rc_billing" },
          },
        },
        managementURL: "https://billing.example/manage",
      }),
    );
    expect(state).toEqual({
      activeProductIds: ["casparel_plus_yearly"],
      entitlementStore: "web",
      manageUrl: "https://billing.example/manage",
    });
  });

  it("recognises a Play-billed entitlement as app-store managed", async () => {
    const state = await fetchWebSubscriptionState(
      purchasesWith({
        activeSubscriptions: new Set(["casparel_pro_monthly:monthly"]),
        entitlements: {
          active: {
            pro: { identifier: "pro", isActive: true, store: "play_store" },
          },
        },
        managementURL: null,
      }),
    );
    expect(state.entitlementStore).toBe("app-store");
    expect(state.activeProductIds).toEqual(["casparel_pro_monthly"]);
  });

  it("reports no entitlement store for a free account", async () => {
    const state = await fetchWebSubscriptionState(
      purchasesWith({
        activeSubscriptions: new Set(),
        entitlements: { active: {} },
        managementURL: null,
      }),
    );
    expect(state).toEqual({
      activeProductIds: [],
      entitlementStore: null,
      manageUrl: null,
    });
  });
});

describe("purchaseWebPackage outcomes", () => {
  it("reports success when the SDK resolves", async () => {
    const purchases = { purchase: async () => ({}) } as unknown as Purchases;
    expect(await purchaseWebPackage(purchases, PLUS_MONTHLY)).toBe("success");
  });

  it("maps a user-cancelled checkout to cancelled, not an error", async () => {
    const { ErrorCode, PurchasesError } = await import("@revenuecat/purchases-js");
    const purchases = {
      purchase: async () => {
        throw new PurchasesError(ErrorCode.UserCancelledError);
      },
    } as unknown as Purchases;
    expect(await purchaseWebPackage(purchases, PLUS_MONTHLY)).toBe("cancelled");
  });

  it("maps every other failure to error", async () => {
    const purchases = {
      purchase: async () => {
        throw new Error("network down");
      },
    } as unknown as Purchases;
    expect(await purchaseWebPackage(purchases, PLUS_MONTHLY)).toBe("error");
  });
});
