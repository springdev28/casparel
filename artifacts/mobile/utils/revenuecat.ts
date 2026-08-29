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
import {
  restoredEntitlementsHaveAccess,
  selectRevenueCatApiKey,
  tierForPackageIdentity,
  tierFromActiveEntitlements,
  type SubscriptionTier,
} from './revenuecat-plans';

export {
  REVENUECAT_PACKAGE_MAP,
  defaultOffering,
  hasPlusAccess,
  packageDefinition,
  packagesForRole,
  restoredEntitlementsHaveAccess,
  selectRevenueCatApiKey,
  tierForPackageIdentity,
  tierFromActiveEntitlements,
  tierLevel,
  upgradePackagesForTier,
  type BillingPeriod,
  type PlanRole,
  type SelfServeTier,
  type SubscriptionTier,
  type TierLevel,
} from './revenuecat-plans';

/**
 * The only entitlement identifiers configured in RevenueCat. Institutional
 * access is manually provisioned by the backend and is never a store product.
 */
export const PLUS_ENTITLEMENT = 'plus';
export const PRO_ENTITLEMENT = 'pro';

export const TIER_TITLES: Record<SubscriptionTier, string> = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  institutional: 'Institutional',
};

/**
 * Public RevenueCat SDK keys. These are *publishable* keys and are safe to ship
 * in the client bundle. Set them via EAS env / app config:
 *   EXPO_PUBLIC_RC_TEST_KEY, EXPO_PUBLIC_RC_IOS_KEY,
 *   EXPO_PUBLIC_RC_ANDROID_KEY. Test Store is selected explicitly per build.
 */
const configuredTestStore = process.env.EXPO_PUBLIC_RC_USE_TEST_STORE;
const useTestStore =
  configuredTestStore === 'true' || (configuredTestStore !== 'false' && __DEV__);
export const RC_API_KEY = selectRevenueCatApiKey({
  platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'other',
  useTestStore,
  testKey: process.env.EXPO_PUBLIC_RC_TEST_KEY,
  iosKey: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  androidKey: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
});

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

/**
 * Purchase failures are classified in their own module.
 *
 * It is pure -- no react-native import, no Platform -- so it can be tested
 * directly. This file cannot be: it reaches for `Platform` at module scope,
 * which does not exist off a device.
 */
export {
  classifyPurchaseError,
  type PurchaseFailure,
} from "./purchase-errors";

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

/**
 * Resolve the two store entitlements. Institutional access is resolved from
 * the authenticated backend account rather than RevenueCat CustomerInfo.
 */
export function subscriptionTier(info: RCCustomerInfo | null | undefined): SubscriptionTier {
  if (!info) return 'free';
  return tierFromActiveEntitlements(info.entitlements.active);
}

/** Compatibility name: true for any paid subscription tier. */
export function hasPremium(info: RCCustomerInfo | null | undefined): boolean {
  return info
    ? restoredEntitlementsHaveAccess(info.entitlements.active)
    : false;
}

/**
 * Resolve only the exact custom package + product pairs configured in the
 * dashboard. An unexpected package returns null and is never purchasable.
 */
export function tierForPackage(pkg: RCPackage): 'plus' | 'pro' | null {
  return tierForPackageIdentity(pkg);
}
