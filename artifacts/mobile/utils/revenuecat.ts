/**
 * @fileOverview Mobile support role: configures or implements Revenuecat for the Expo application.
 * System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.
 */
/**
 * RevenueCat configuration + a platform-safe loader for `react-native-purchases`.
 *
 * The native module only exists in a real dev/release build (not Expo Go, not web),
 * so, exactly like `secure-storage.ts`, we load it lazily and degrade gracefully
 * everywhere it is unavailable. A minimal local interface keeps this file type-safe
 * whether or not the package is installed in the current environment; the real
 * module (which ships its own richer types) satisfies this shape at runtime.
 */
import { Platform } from 'react-native';

/** Entitlement identifiers configured in RevenueCat. */
export const PLUS_ENTITLEMENT = 'plus';
export const PRO_ENTITLEMENT = 'pro';
export const PREMIUM_ENTITLEMENT = 'premium';
export type SubscriptionTier = 'free' | 'plus' | 'pro';
export type PaidSubscriptionTier = Exclude<SubscriptionTier, 'free'>;

/**
 * Public RevenueCat SDK keys. These are *publishable* keys and are safe to ship
 * in the client bundle. Set them via EAS env / app config:
 *   EXPO_PUBLIC_RC_IOS_KEY, EXPO_PUBLIC_RC_ANDROID_KEY
 */
export const RC_API_KEY: string | null =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_RC_IOS_KEY,
    android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
    default: undefined,
  }) ?? null;

// ---- Minimal typed surface of the bits of the SDK we use -------------------

export interface RCProduct {
  identifier: string;
  title: string;
  description: string;
  priceString: string;
  price: number;
  currencyCode: string;
}

export interface RCPackage {
  identifier: string;
  packageType: string;
  product: RCProduct;
}

export interface RCOffering {
  identifier: string;
  serverDescription: string;
  availablePackages: RCPackage[];
  monthly?: RCPackage | null;
  annual?: RCPackage | null;
  lifetime?: RCPackage | null;
}

export interface RCEntitlementInfo {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  productIdentifier: string;
  expirationDate: string | null;
}

export interface RCCustomerInfo {
  entitlements: {
    active: Record<string, RCEntitlementInfo>;
    all: Record<string, RCEntitlementInfo>;
  };
  activeSubscriptions: string[];
  managementURL: string | null;
}

export interface PurchasesModule {
  configure(opts: { apiKey: string; appUserID?: string | null }): void;
  setLogLevel(level: number): void;
  getOfferings(): Promise<{ current: RCOffering | null; all: Record<string, RCOffering> }>;
  getCustomerInfo(): Promise<RCCustomerInfo>;
  purchasePackage(pkg: RCPackage): Promise<{ customerInfo: RCCustomerInfo }>;
  restorePurchases(): Promise<RCCustomerInfo>;
  logIn(appUserID: string): Promise<{ customerInfo: RCCustomerInfo }>;
  logOut(): Promise<RCCustomerInfo>;
  addCustomerInfoUpdateListener(listener: (info: RCCustomerInfo) => void): void;
  removeCustomerInfoUpdateListener(listener: (info: RCCustomerInfo) => void): void;
}

/** True when the app is running somewhere IAP can actually work. */
export const purchasesSupported = Platform.OS === 'ios' || Platform.OS === 'android';

let cached: PurchasesModule | null | undefined;

/**
 * Lazily load the native module. Returns `null` on web, in Expo Go, or if the
 * package is not present, callers must handle the null case.
 */
export async function loadPurchases(): Promise<PurchasesModule | null> {
  if (cached !== undefined) return cached;
  if (!purchasesSupported) {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore optional native dependency, resolved at build time by EAS
    const mod = await import('react-native-purchases');
    cached = (mod.default ?? mod) as unknown as PurchasesModule;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

/** Resolve active entitlements, preserving legacy `premium` buyers as Pro. */
export function subscriptionTier(info: RCCustomerInfo | null | undefined): SubscriptionTier {
  if (!info) return 'free';
  const active = info.entitlements.active;
  if (active[PRO_ENTITLEMENT]?.isActive || active[PREMIUM_ENTITLEMENT]?.isActive) return 'pro';
  if (active[PLUS_ENTITLEMENT]?.isActive) return 'plus';
  return 'free';
}

/** Compatibility name: true for either paid subscription tier. */
export function hasPremium(info: RCCustomerInfo | null | undefined): boolean {
  return subscriptionTier(info) !== 'free';
}

/**
 * Map only recognised products into Casparel's public plan model.
 *
 * RevenueCat offerings are remote configuration. Returning null for a new or
 * mistyped product keeps the paywall from accidentally advertising it as Pro,
 * which was the unsafe result of treating every non-Plus identifier as Pro.
 */
export function tierForPackage(pkg: RCPackage): PaidSubscriptionTier | null {
  const identity = `${pkg.identifier} ${pkg.product.identifier} ${pkg.product.title}`.toLowerCase();
  if (identity.includes('plus')) return 'plus';
  if (identity.includes('pro') || identity.includes('premium')) return 'pro';
  return null;
}
