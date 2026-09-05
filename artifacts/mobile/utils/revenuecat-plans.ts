/** Pure RevenueCat plan rules, kept independent of React Native for testing. */

export type SubscriptionTier = 'free' | 'plus' | 'pro' | 'institutional';
export type SelfServeTier = 'plus' | 'pro';
export type TierLevel = 'free' | 'plus' | 'pro';
export type PlanRole = 'student' | 'teacher';
export type BillingPeriod = 'monthly' | 'yearly';

export interface RevenueCatPackageIdentity {
  identifier: string;
  product: { identifier: string };
}

export const REVENUECAT_PACKAGE_MAP = {
  plus_monthly: {
    tier: 'plus',
    period: 'monthly',
    productId: 'casparel_plus_monthly:monthly',
  },
  plus_yearly: {
    tier: 'plus',
    period: 'yearly',
    productId: 'casparel_plus_yearly:yearly',
  },
  pro_monthly: {
    tier: 'pro',
    period: 'monthly',
    productId: 'casparel_pro_monthly:monthly',
  },
  pro_yearly: {
    tier: 'pro',
    period: 'yearly',
    productId: 'casparel_pro_yearly:yearly',
  },
} as const satisfies Record<
  string,
  { tier: SelfServeTier; period: BillingPeriod; productId: string }
>;

export type RevenueCatPackageIdentifier = keyof typeof REVENUECAT_PACKAGE_MAP;

export const REQUIRED_REVENUECAT_PACKAGE_IDENTIFIERS = Object.freeze(
  Object.keys(REVENUECAT_PACKAGE_MAP) as RevenueCatPackageIdentifier[],
);

/** Exact correctly wired package identifiers missing from an offering. */
export function missingRequiredPackages(
  packages: readonly RevenueCatPackageIdentity[],
): RevenueCatPackageIdentifier[] {
  const valid = new Set(
    packages
      .filter((pkg) => packageDefinition(pkg) !== null)
      .map((pkg) => pkg.identifier as RevenueCatPackageIdentifier),
  );
  return REQUIRED_REVENUECAT_PACKAGE_IDENTIFIERS.filter(
    (identifier) => !valid.has(identifier),
  );
}

/**
 * A store product identifier without the Google Play base-plan suffix.
 *
 * Google Play reports subscriptions as `product:basePlan` while the App Store
 * and RevenueCat's own product APIs use the bare product id. One product is
 * still one product either way, so identity comparisons happen on this form.
 */
export function baseProductId(productId: string): string {
  return productId.split(':')[0] ?? productId;
}

export function packageDefinition(
  pkg: RevenueCatPackageIdentity,
): (typeof REVENUECAT_PACKAGE_MAP)[RevenueCatPackageIdentifier] | null {
  const definition = REVENUECAT_PACKAGE_MAP[
    pkg.identifier as RevenueCatPackageIdentifier
  ];
  if (!definition) return null;
  // Accept both spellings of the same product: the Play form with the base
  // plan (`casparel_plus_monthly:monthly`) and the bare id the App Store and
  // some RevenueCat responses use. Anything else fails closed.
  const offered = pkg.product.identifier;
  if (
    definition.productId !== offered &&
    baseProductId(definition.productId) !== offered
  ) {
    return null;
  }
  return definition;
}

export function tierForPackageIdentity(
  pkg: RevenueCatPackageIdentity,
): SelfServeTier | null {
  return packageDefinition(pkg)?.tier ?? null;
}

export function tierLevel(tier: SubscriptionTier): TierLevel {
  if (tier === 'free') return 'free';
  if (tier === 'plus') return 'plus';
  return 'pro';
}

export function tierFromActiveEntitlements(
  active: Record<string, { isActive: boolean } | undefined>,
): SubscriptionTier {
  if (active.pro?.isActive) return 'pro';
  if (active.plus?.isActive) return 'plus';
  return 'free';
}

export function hasPlusAccess(tier: SubscriptionTier): boolean {
  return tier === 'plus' || tier === 'pro' || tier === 'institutional';
}

export function restoredEntitlementsHaveAccess(
  active: Record<string, { isActive: boolean } | undefined>,
): boolean {
  return hasPlusAccess(tierFromActiveEntitlements(active));
}

/**
 * Role is deliberately ignored: student and teacher are account roles, not
 * products. Unknown or miswired custom packages are filtered out safely.
 */
export function packagesForRole<T extends RevenueCatPackageIdentity>(
  packages: T[],
  _role: PlanRole | null,
): T[] {
  return packages.filter((pkg) => packageDefinition(pkg) !== null);
}

export function upgradePackagesForTier<T extends RevenueCatPackageIdentity>(
  packages: T[],
  tier: SubscriptionTier,
): T[] {
  if (tier === 'pro' || tier === 'institutional') return [];
  return packages.filter((pkg) => {
    const packageTier = tierForPackageIdentity(pkg);
    return packageTier !== null && (tier === 'free' || packageTier === 'pro');
  });
}

/**
 * Google Play subscription replacement, decided from the store's own state.
 *
 * When the account already holds a Casparel subscription product and buys a
 * different one, Play must be told this is a *change* to the existing
 * subscription — otherwise it opens a second, simultaneous subscription and
 * the person pays twice. Returns the old product to replace, or null for a
 * first purchase (or a re-buy of the same product, which Play rejects with
 * "already owned" on its own).
 */
export function googleProductChangeFor(
  activeSubscriptions: readonly string[],
  pkg: RevenueCatPackageIdentity,
): { oldProductIdentifier: string } | null {
  if (packageDefinition(pkg) === null) return null;
  const buying = baseProductId(pkg.product.identifier);
  const knownProducts = new Set(
    Object.values(REVENUECAT_PACKAGE_MAP).map((definition) =>
      baseProductId(definition.productId),
    ),
  );
  for (const active of activeSubscriptions) {
    const activeProduct = baseProductId(active);
    if (activeProduct !== buying && knownProducts.has(activeProduct)) {
      return { oldProductIdentifier: activeProduct };
    }
  }
  return null;
}

export function defaultOffering<T extends { identifier: string }>(offerings: {
  current: T | null;
  all: Record<string, T>;
}): T | null {
  const configured = offerings.all.default;
  if (configured?.identifier === 'default') return configured;
  return offerings.current?.identifier === 'default' ? offerings.current : null;
}

export interface RevenueCatKeySelection {
  platform: 'ios' | 'android' | 'other';
  useTestStore: boolean;
  testKey?: string;
  iosKey?: string;
  androidKey?: string;
}

export function selectRevenueCatApiKey({
  platform,
  useTestStore,
  testKey,
  iosKey,
  androidKey,
}: RevenueCatKeySelection): string | null {
  const selected = useTestStore
    ? testKey
    : platform === 'ios'
      ? iosKey
      : platform === 'android'
        ? androidKey
        : undefined;
  if (!selected?.trim()) return null;
  if (useTestStore && !selected.trim().startsWith('test_')) return null;
  if (!useTestStore && selected.trim().startsWith('test_')) return null;
  return selected.trim();
}
