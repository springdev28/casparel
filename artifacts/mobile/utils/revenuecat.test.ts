/**
 * @fileOverview Verification role: protects the mobile Free/Plus/Pro mapping at the remote RevenueCat boundary.
 * System connection: ensures paywall offerings and local entitlement display cannot invent access for unknown products.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RCCustomerInfo, RCEntitlementInfo, RCPackage } from './revenuecat';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (values: Record<string, string | undefined>) => values.ios,
  },
}));

type RevenueCatModule = typeof import('./revenuecat');
let revenuecat: RevenueCatModule;

beforeAll(async () => {
  revenuecat = await import('./revenuecat');
});

function storePackage(identity: string): RCPackage {
  return {
    identifier: identity,
    packageType: 'MONTHLY',
    product: {
      identifier: `com.casparel.${identity}`,
      title: identity,
      description: '',
      priceString: '$4.99',
      price: 4.99,
      currencyCode: 'USD',
    },
  };
}

function customerInfo(...activeIds: string[]): RCCustomerInfo {
  const active = Object.fromEntries(
    activeIds.map((identifier) => [
      identifier,
      {
        identifier,
        isActive: true,
        willRenew: true,
        productIdentifier: `com.casparel.${identifier}`,
        expirationDate: '2026-09-22T12:00:00.000Z',
      } satisfies RCEntitlementInfo,
    ]),
  );
  return {
    entitlements: { active, all: active },
    activeSubscriptions: activeIds,
    managementURL: null,
  };
}

describe('RevenueCat plan mapping', () => {
  it('maps current and legacy paid entitlements into the three public tiers', () => {
    expect(revenuecat.subscriptionTier(customerInfo('plus'))).toBe('plus');
    expect(revenuecat.subscriptionTier(customerInfo('pro'))).toBe('pro');
    expect(revenuecat.subscriptionTier(customerInfo('premium'))).toBe('pro');
    expect(revenuecat.subscriptionTier(customerInfo('unknown'))).toBe('free');
  });

  it('prefers Pro while overlapping entitlements are active during an upgrade', () => {
    expect(revenuecat.subscriptionTier(customerInfo('plus', 'pro'))).toBe('pro');
  });

  it('refuses to label an unknown remotely configured package as Pro', () => {
    expect(revenuecat.tierForPackage(storePackage('plus_monthly'))).toBe('plus');
    expect(revenuecat.tierForPackage(storePackage('pro_annual'))).toBe('pro');
    expect(revenuecat.tierForPackage(storePackage('premium_legacy'))).toBe('pro');
    expect(revenuecat.tierForPackage(storePackage('founders_bundle'))).toBeNull();
  });
});
