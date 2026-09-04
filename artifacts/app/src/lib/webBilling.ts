/**
 * @fileOverview Web domain role: centralizes Web Billing state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
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

/**
 * Tiers sellable through checkout. Institutional is excluded on purpose: the
 * school licence is sales-led (per-seat, invoiced, granted as a promotional
 * entitlement), never a store package.
 */
export type PaidTier = Exclude<
  PlanTier,
  "free" | "administrator" | "institutional"
>;
export type BillingPeriod = "monthly" | "annual" | "other";

const WEB_PACKAGE_MAP = {
  plus_monthly: { tier: "plus", period: "monthly", productId: "casparel_plus_monthly" },
  plus_yearly: { tier: "plus", period: "annual", productId: "casparel_plus_yearly" },
  pro_monthly: { tier: "pro", period: "monthly", productId: "casparel_pro_monthly" },
  pro_yearly: { tier: "pro", period: "annual", productId: "casparel_pro_yearly" },
} as const satisfies Record<
  string,
  { tier: PaidTier; period: BillingPeriod; productId: string }
>;

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
 * Resolve only the exact custom package and product pair. Unexpected packages
 * fail closed instead of being guessed from display names.
 */
export function tierForWebPackage(pkg: Package): PaidTier | null {
  const product = pkg.webBillingProduct;
  const definition = WEB_PACKAGE_MAP[pkg.identifier as keyof typeof WEB_PACKAGE_MAP];
  return definition && definition.productId === product?.identifier
    ? definition.tier
    : null;
}

function periodOf(pkg: Package): BillingPeriod {
  return WEB_PACKAGE_MAP[pkg.identifier as keyof typeof WEB_PACKAGE_MAP]?.period ?? "other";
}

/**
 * Account role deliberately has no effect on billing products.
 */
export function webPackagesForRole(
  packages: WebPlanPackage[],
  _role: "student" | "teacher" | null,
): WebPlanPackage[] {
  return packages;
}

let instance: Purchases | null = null;
let instanceUserId: string | null = null;

/**
 * Configure (or re-target) the SDK. Signed-in accounts use the numeric
 * Casparel user id — the same identity the mobile SDK logs in with, which is
 * what lets the server webhook attach a purchase to the right account.
 * `null` configures an anonymous RevenueCat identity so signed-out visitors
 * can still see live prices; buying always goes through sign-in first, and
 * the post-login load calls changeUser onto the real account.
 */
export async function loadWebBilling(
  userId: number | null,
): Promise<Purchases | null> {
  if (!webBillingConfigured()) return null;
  const { Purchases: PurchasesClass } = await import("@revenuecat/purchases-js");
  const appUserId =
    userId != null
      ? String(userId)
      : (instanceUserId?.startsWith("$RCAnonymousID") ? instanceUserId : null) ??
        PurchasesClass.generateRevenueCatAnonymousAppUserId();
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
  const offering = offerings.all.default?.identifier === "default"
    ? offerings.all.default
    : offerings.current?.identifier === "default"
      ? offerings.current
      : null;
  return (offering?.availablePackages ?? []).flatMap((pkg) => {
    const tier = tierForWebPackage(pkg);
    return tier
      ? [{
          id: pkg.identifier,
          tier,
          period: periodOf(pkg),
          price: pkg.webBillingProduct?.currentPrice?.formattedPrice ?? "",
          raw: pkg,
        }]
      : [];
  });
}

/** A store product id without Google Play's `:basePlan` suffix. */
export function baseWebProductId(productId: string): string {
  return productId.split(":")[0] ?? productId;
}

/**
 * Which kind of store granted the account's paid entitlement. Purchases made
 * here (RevenueCat Web Billing — Stripe or Paddle backed) can be changed
 * here; a subscription billed by Apple or Google must be changed in that
 * store, and offering a card purchase beside it would run two subscriptions
 * at once.
 */
export type EntitlementStoreKind = "web" | "app-store" | null;

const WEB_STORES = new Set(["rc_billing", "stripe", "paddle", "promotional", "test_store"]);

export interface WebSubscriptionState {
  /** Active subscription products on this RevenueCat customer, base ids. */
  activeProductIds: string[];
  entitlementStore: EntitlementStoreKind;
  manageUrl: string | null;
}

export async function fetchWebSubscriptionState(
  purchases: Purchases,
): Promise<WebSubscriptionState> {
  const info = await purchases.getCustomerInfo();
  const activeProductIds = [...info.activeSubscriptions].map(baseWebProductId);
  const activeEntitlements = Object.values(info.entitlements.active ?? {});
  const paid = activeEntitlements.find(
    (entitlement) =>
      entitlement.identifier === "plus" || entitlement.identifier === "pro",
  );
  return {
    activeProductIds,
    entitlementStore: paid
      ? WEB_STORES.has(paid.store)
        ? "web"
        : "app-store"
      : null,
    manageUrl: info.managementURL ?? null,
  };
}

/** What the one visible control on a plan package should do. */
export type WebPackageAction =
  /** Not shown: administrators and undetermined plan states sell nothing. */
  | "hidden"
  /** This is the product the account is on. */
  | "current"
  | "subscribe"
  | "switch-tier"
  | "switch-period"
  /** Paid through Apple/Google: the change belongs to that store. */
  | "app-managed";

export interface WebPlanContext {
  /** False for a visitor: they see Subscribe and are sent through sign-in. */
  signedIn: boolean;
  isAdmin: boolean;
  /** True while the server has not yet said which plan the account is on. */
  pending: boolean;
  /** The account's current price level, from the server. */
  currentLevel: "free" | "plus" | "pro";
  /** True for the sales-led school licence: nothing self-serve applies. */
  institutional: boolean;
  subscription: WebSubscriptionState | null;
}

/**
 * Decide the control for one package. Pure, so every state in the matrix —
 * free, paid-on-web, paid-in-app, institutional, admin, undecided — has a
 * unit test instead of a manual QA pass.
 */
export function webPackageAction(
  pkg: WebPlanPackage,
  context: WebPlanContext,
): WebPackageAction {
  if (!context.signedIn) return "subscribe";
  if (context.isAdmin || context.institutional) return "hidden";
  // Until the server has answered, selling anything risks selling the wrong
  // thing (a "Subscribe" on an account that is already Pro).
  if (context.pending) return "hidden";
  if (context.currentLevel === "free") return "subscribe";
  // Paid. Work out what they hold and where it was bought.
  const subscription = context.subscription;
  if (!subscription || subscription.entitlementStore === "app-store") {
    return "app-managed";
  }
  const active = new Set(subscription.activeProductIds);
  const definition = WEB_PACKAGE_MAP[pkg.id as keyof typeof WEB_PACKAGE_MAP];
  if (!definition) return "hidden";
  if (active.has(baseWebProductId(definition.productId))) return "current";
  const currentDefinitions = Object.values(WEB_PACKAGE_MAP).filter((candidate) =>
    active.has(baseWebProductId(candidate.productId)),
  );
  const currentTiers = new Set(currentDefinitions.map((candidate) => candidate.tier));
  if (currentTiers.size > 0 && !currentTiers.has(definition.tier)) {
    return "switch-tier";
  }
  return "switch-period";
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
