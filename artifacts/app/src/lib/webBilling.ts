/**
 * Web card checkout, through RevenueCat Web Billing (Stripe-backed).
 *
 * Why this and not a separate Stripe integration: purchases made here emit the
 * same RevenueCat webhook events, with the same entitlement identifiers, as
 * App Store and Play purchases. The server's existing webhook is therefore the
 * single reconciliation path for every store — a card purchase on the web
 * grants the plan through exactly the code that a phone purchase does, and the
 * role-matching rules keep applying because they live at read time on the
 * server, not in any client.
 *
 * The SDK is loaded lazily and only when `VITE_REVENUECAT_WEB_API_KEY` is set
 * (a Web Billing *public* key, `rcb_...` — publishable client configuration,
 * like the mobile SDK keys). Without it the plans page falls back to the
 * buy-on-mobile instructions, so an undeployed key can never produce a broken
 * checkout, and the browser audit (which runs unconfigured) never loads the
 * SDK at all.
 */
import type { Package, Purchases } from "@revenuecat/purchases-js";
import type { PlanTier } from "./use-plan";

export type PaidTier = Exclude<PlanTier, "free" | "administrator">;
export type BillingPeriod = "monthly" | "annual" | "other";

export interface WebPlanPackage {
  /** RevenueCat package identifier. */
  id: string;
  tier: PaidTier;
  period: BillingPeriod;
  /** Localised, currency-formatted price from the store. */
  price: string;
  raw: Package;
}

const WEB_BILLING_KEY: string | undefined = import.meta.env
  .VITE_REVENUECAT_WEB_API_KEY as string | undefined;

export function webBillingConfigured(): boolean {
  return typeof WEB_BILLING_KEY === "string" && WEB_BILLING_KEY.length > 0;
}

/**
 * Map a package to the tier it sells. Mirror of `tierForPackage` in
 * artifacts/mobile/utils/revenuecat.ts — keep the two in sync: role words are
 * matched first, then the level, and `pro` beats `plus` so "Pro Plus"-style
 * names never undersell. Explicit product-identifier mapping in the dashboard
 * remains the real fix; this is the mapping of last resort.
 */
export function tierForWebPackage(pkg: Package): PaidTier {
  const product = pkg.webBillingProduct;
  const identity =
    `${pkg.identifier} ${product?.identifier ?? ""} ${product?.displayName ?? ""}`.toLowerCase();
  const level: "plus" | "pro" = identity.includes("pro") ? "pro" : "plus";
  if (identity.includes("teacher")) return `teacher-${level}`;
  if (identity.includes("student")) return `student-${level}`;
  return level;
}

function periodOf(pkg: Package): BillingPeriod {
  const type = String(pkg.packageType ?? "").toLowerCase();
  const duration = (pkg.webBillingProduct?.normalPeriodDuration ?? "").toUpperCase();
  if (type.includes("annual") || duration === "P1Y") return "annual";
  if (type.includes("monthly") || duration === "P1M") return "monthly";
  return "other";
}

/** The account role a tier is reserved for; null when any role may hold it. */
function tierRole(tier: PaidTier): "student" | "teacher" | null {
  if (tier === "student-plus" || tier === "student-pro") return "student";
  if (tier === "teacher-plus" || tier === "teacher-pro") return "teacher";
  return null;
}

/**
 * Roles never mix at the point of sale, on the web exactly as on mobile:
 * role-specific packages for the buyer's role are preferred, generic packages
 * appear only when the offering has none for that role, and the other role's
 * packages are never shown.
 */
export function webPackagesForRole(
  packages: WebPlanPackage[],
  role: "student" | "teacher" | null,
): WebPlanPackage[] {
  const allowed = packages.filter((pkg) => {
    const pkgRole = tierRole(pkg.tier);
    return pkgRole === null || pkgRole === role;
  });
  if (!role) return allowed;
  const roleSpecific = allowed.filter((pkg) => tierRole(pkg.tier) === role);
  return roleSpecific.length > 0 ? roleSpecific : allowed;
}

let instance: Purchases | null = null;
let instanceUserId: string | null = null;

/**
 * Configure (or re-target) the SDK for the signed-in Casparel account. The
 * numeric user id is the same identity the mobile SDK logs in with, which is
 * what lets the server webhook attach the purchase to the right account.
 */
export async function loadWebBilling(userId: number): Promise<Purchases | null> {
  if (!webBillingConfigured()) return null;
  const appUserId = String(userId);
  const { Purchases: PurchasesClass } = await import("@revenuecat/purchases-js");
  if (instance && instanceUserId === appUserId) return instance;
  if (instance) {
    await instance.changeUser(appUserId);
    instanceUserId = appUserId;
    return instance;
  }
  instance = PurchasesClass.configure(WEB_BILLING_KEY as string, appUserId);
  instanceUserId = appUserId;
  return instance;
}

export async function fetchWebPackages(
  purchases: Purchases,
): Promise<WebPlanPackage[]> {
  const offerings = await purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return packages.map((pkg) => ({
    id: pkg.identifier,
    tier: tierForWebPackage(pkg),
    period: periodOf(pkg),
    price: pkg.webBillingProduct?.currentPrice?.formattedPrice ?? "",
    raw: pkg,
  }));
}

export type WebPurchaseOutcome = "success" | "cancelled" | "error";

/**
 * Run RevenueCat's hosted card checkout for one package. The SDK renders its
 * own payment UI; entitlement lands on the account via the server webhook a
 * few seconds after the charge, so callers should refetch usage after success
 * rather than trusting local state.
 */
export async function purchaseWebPackage(
  purchases: Purchases,
  pkg: WebPlanPackage,
): Promise<WebPurchaseOutcome> {
  try {
    await purchases.purchase({ rcPackage: pkg.raw });
    return "success";
  } catch (error) {
    const { ErrorCode, PurchasesError } = await import(
      "@revenuecat/purchases-js"
    );
    if (
      error instanceof PurchasesError &&
      error.errorCode === ErrorCode.UserCancelledError
    ) {
      return "cancelled";
    }
    return "error";
  }
}

/** Where an active web subscription is managed (invoices, card, cancel). */
export async function managementUrl(
  purchases: Purchases,
): Promise<string | null> {
  try {
    const info = await purchases.getCustomerInfo();
    return info.managementURL ?? null;
  } catch {
    return null;
  }
}
