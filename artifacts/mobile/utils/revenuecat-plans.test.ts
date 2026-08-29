import { describe, expect, it } from 'vitest';
import {
  REVENUECAT_PACKAGE_MAP,
  defaultOffering,
  hasPlusAccess,
  packagesForRole,
  restoredEntitlementsHaveAccess,
  selectRevenueCatApiKey,
  tierForPackageIdentity,
  tierFromActiveEntitlements,
  upgradePackagesForTier,
} from './revenuecat-plans';

const packages = Object.entries(REVENUECAT_PACKAGE_MAP).map(
  ([identifier, definition]) => ({
    identifier,
    product: { identifier: definition.productId },
  }),
);

describe('RevenueCat plan mapping', () => {
  it('resolves no entitlement to Free and Plus/Pro exactly', () => {
    expect(tierFromActiveEntitlements({})).toBe('free');
    expect(tierFromActiveEntitlements({ plus: { isActive: true } })).toBe('plus');
    expect(tierFromActiveEntitlements({ pro: { isActive: true } })).toBe('pro');
    expect(
      tierFromActiveEntitlements({
        plus: { isActive: true },
        pro: { isActive: true },
      }),
    ).toBe('pro');
    expect(hasPlusAccess('pro')).toBe(true);
  });

  it.each([
    ['plus_monthly', 'casparel_plus_monthly', 'plus'],
    ['plus_yearly', 'casparel_plus_yearly', 'plus'],
    ['pro_monthly', 'casparel_pro_monthly', 'pro'],
    ['pro_yearly', 'casparel_pro_yearly', 'pro'],
  ] as const)('maps %s only to %s', (identifier, productId, tier) => {
    expect(tierForPackageIdentity({ identifier, product: { identifier: productId } })).toBe(
      tier,
    );
  });

  it('fails safely for unexpected or miswired packages', () => {
    expect(
      tierForPackageIdentity({
        identifier: 'teacher_pro_monthly',
        product: { identifier: 'casparel_teacher_pro_monthly' },
      }),
    ).toBeNull();
    expect(
      tierForPackageIdentity({
        identifier: 'pro_monthly',
        product: { identifier: 'casparel_plus_monthly' },
      }),
    ).toBeNull();
  });

  it('offers Plus users only Pro and Pro users no purchase CTA', () => {
    expect(upgradePackagesForTier(packages, 'plus').map((pkg) => pkg.identifier)).toEqual([
      'pro_monthly',
      'pro_yearly',
    ]);
    expect(upgradePackagesForTier(packages, 'pro')).toEqual([]);
  });

  it('does not change products with the account role', () => {
    expect(packagesForRole(packages, 'student')).toEqual(packagesForRole(packages, 'teacher'));
  });

  it('resolves restored CustomerInfo to paid access', () => {
    expect(restoredEntitlementsHaveAccess({ plus: { isActive: true } })).toBe(true);
    expect(restoredEntitlementsHaveAccess({ pro: { isActive: true } })).toBe(true);
    expect(restoredEntitlementsHaveAccess({})).toBe(false);
  });

  it('uses only the explicitly configured default offering', () => {
    const offering = { identifier: 'default' };
    expect(defaultOffering({ current: null, all: { default: offering } })).toBe(offering);
    expect(
      defaultOffering({ current: { identifier: 'experiment' }, all: {} }),
    ).toBeNull();
  });

  it('rejects a Test Store key for production selection', () => {
    expect(
      selectRevenueCatApiKey({
        platform: 'android',
        useTestStore: false,
        testKey: 'test_valid',
        androidKey: 'test_never_ship',
      }),
    ).toBeNull();
    expect(
      selectRevenueCatApiKey({
        platform: 'android',
        useTestStore: true,
        testKey: 'test_valid',
      }),
    ).toBe('test_valid');
  });
});
