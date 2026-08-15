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

/**
 * Entitlement identifiers configured in RevenueCat. `premium` is legacy.
 * `institutional` is the sales-led school licence — granted as a promotional
 * entitlement, never sold as a store package, so it appears in tier
 * resolution but not in any paywall package list.
 */
export const PLUS_ENTITLEMENT = 'plus';
export const PRO_ENTITLEMENT = 'pro';
export const PREMIUM_ENTITLEMENT = 'premium';
export const STUDENT_PLUS_ENTITLEMENT = 'student-plus';
export const STUDENT_PRO_ENTITLEMENT = 'student-pro';
export const TEACHER_PLUS_ENTITLEMENT = 'teacher-plus';
export const TEACHER_PRO_ENTITLEMENT = 'teacher-pro';
export const INSTITUTIONAL_ENTITLEMENT = 'institutional';

export type SubscriptionTier =
  | 'free'
  | 'plus'
  | 'pro'
  | 'student-plus'
  | 'student-pro'
  | 'teacher-plus'
  | 'teacher-pro'
  | 'institutional';
export type TierLevel = 'free' | 'plus' | 'pro';
export type PlanRole = 'student' | 'teacher';

export const TIER_TITLES: Record<SubscriptionTier, string> = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  'student-plus': 'Student Plus',
  'student-pro': 'Student Pro',
  'teacher-plus': 'Teacher Plus',
  'teacher-pro': 'Teacher Pro',
  institutional: 'Institutional',
};

/**
 * Collapse a tier to its price level, for upgrade logic and CTAs. The school
 * licence reports 'pro': it sits above Pro, but there is nothing self-serve
 * to sell past it, so every "offer an upgrade?" decision must answer no.
 */
export function tierLevel(tier: SubscriptionTier): TierLevel {
  if (tier === 'free') return 'free';
  if (tier === 'plus' || tier === 'student-plus' || tier === 'teacher-plus') return 'plus';
  return 'pro';
}

/** The account role a tier is reserved for, or null when any role may hold it. */
export function tierRole(tier: SubscriptionTier): PlanRole | null {
  if (tier === 'student-plus' || tier === 'student-pro') return 'student';
  if (tier === 'teacher-plus' || tier === 'teacher-pro') return 'teacher';
  return null;
}

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

/**
 * Resolve active entitlements to a tier. Role-specific Pro entitlements win
 * over generic ones, then the Plus level the same way; legacy `premium` maps
 * to Pro. The server applies the same precedence in its webhook, so the badge
 * on the device and the plan on the account cannot disagree about a stack of
 * entitlements.
 */
export function subscriptionTier(info: RCCustomerInfo | null | undefined): SubscriptionTier {
  if (!info) return 'free';
  const active = info.entitlements.active;
  if (active[INSTITUTIONAL_ENTITLEMENT]?.isActive) return 'institutional';
  if (active[TEACHER_PRO_ENTITLEMENT]?.isActive) return 'teacher-pro';
  if (active[STUDENT_PRO_ENTITLEMENT]?.isActive) return 'student-pro';
  if (active[PRO_ENTITLEMENT]?.isActive || active[PREMIUM_ENTITLEMENT]?.isActive) return 'pro';
  if (active[TEACHER_PLUS_ENTITLEMENT]?.isActive) return 'teacher-plus';
  if (active[STUDENT_PLUS_ENTITLEMENT]?.isActive) return 'student-plus';
  if (active[PLUS_ENTITLEMENT]?.isActive) return 'plus';
  return 'free';
}

/** Compatibility name: true for any paid subscription tier. */
export function hasPremium(info: RCCustomerInfo | null | undefined): boolean {
  return subscriptionTier(info) !== 'free';
}

/**
 * Map a store package to the tier it sells, from the package/product
 * identifiers and title. Role words are matched first, then the level;
 * `pro` beats `plus` when both appear so "Pro Plus"-style names never
 * undersell. Products should still be named unambiguously in the dashboard —
 * this is a mapping of last resort, not a naming convention.
 */
export function tierForPackage(pkg: RCPackage): Exclude<SubscriptionTier, 'free'> {
  const identity = `${pkg.identifier} ${pkg.product.identifier} ${pkg.product.title}`.toLowerCase();
  const level: Exclude<TierLevel, 'free'> = identity.includes('pro') ? 'pro' : 'plus';
  if (identity.includes('teacher')) return `teacher-${level}`;
  if (identity.includes('student')) return `student-${level}`;
  return level;
}

/**
 * The packages one account may actually buy: never the other role's plans,
 * always the generic Plus/Pro alongside the role-specific ones. The generic
 * plans are the original offering and stay purchasable on every role — a
 * student may pick Student Pro or plain Pro, but never a teacher plan.
 */
export function packagesForRole(
  packages: RCPackage[],
  role: PlanRole | null,
): RCPackage[] {
  return packages.filter((pkg) => {
    const pkgRole = tierRole(tierForPackage(pkg));
    return pkgRole === null || pkgRole === role;
  });
}
