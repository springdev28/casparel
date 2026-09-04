import { describe, expect, it } from 'vitest';
import { adRequestAllowed, canDisableAds, shouldShowSponsoredAd } from './ad-placement';

describe('shouldShowSponsoredAd', () => {
  it('shows a scrollable sponsored section on ordinary app pages', () => {
    for (const path of [
      '/dashboard',
      '/resources',
      '/activities',
      '/goals',
      '/lists',
      '/forum',
    ]) {
      expect(shouldShowSponsoredAd(path)).toBe(true);
    }
  });

  it('keeps ads out of settings, private, billing, and editing pages', () => {
    for (const path of [
      '/settings',
      '/profile',
      '/messages',
      '/plans',
      '/admin/users',
      '/canvases/123',
      '/classes/123',
    ]) {
      expect(shouldShowSponsoredAd(path)).toBe(false);
    }
  });
});

describe('who may turn advertising off', () => {
  it('lets a paying Pro subscriber disable ads', () => {
    expect(canDisableAds({ storeLevel: 'pro' })).toBe(true);
  });

  it('lets the Google Play review account disable ads like any Pro', () => {
    // The reviewer holds Pro granted by the server, with no store
    // subscription behind it. Reading only RevenueCat would show them a
    // locked control for access they actually have.
    expect(canDisableAds({ storeLevel: 'free', serverTier: 'pro' })).toBe(true);
  });

  it('lets an institutional seat and an administrator disable ads', () => {
    expect(canDisableAds({ storeLevel: 'free', serverTier: 'institutional' })).toBe(true);
    expect(canDisableAds({ storeLevel: 'free', serverTier: 'free', unlimited: true })).toBe(true);
    expect(canDisableAds({ storeLevel: 'free', serverTier: 'administrator' })).toBe(true);
  });

  it('does not offer it to Free or Plus', () => {
    expect(canDisableAds({ storeLevel: 'free', serverTier: 'free' })).toBe(false);
    expect(canDisableAds({ storeLevel: 'plus', serverTier: 'plus' })).toBe(false);
  });
});

describe('when an ad may be requested', () => {
  const allowed = {
    sdkReady: true,
    preferencesReady: true,
    consentGranted: true,
    adsDisabled: false,
    entitlement: { storeLevel: 'free' as const, serverTier: 'free' as const },
  };

  it('requests an ad for a consenting free account', () => {
    expect(adRequestAllowed(allowed)).toBe(true);
  });

  it('waits for consent, the SDK, and the saved preferences', () => {
    expect(adRequestAllowed({ ...allowed, consentGranted: false })).toBe(false);
    expect(adRequestAllowed({ ...allowed, sdkReady: false })).toBe(false);
    expect(adRequestAllowed({ ...allowed, preferencesReady: false })).toBe(false);
  });

  it('honours Disable ads for an entitled account, including the reviewer', () => {
    expect(
      adRequestAllowed({
        ...allowed,
        adsDisabled: true,
        entitlement: { storeLevel: 'pro' },
      }),
    ).toBe(false);
    expect(
      adRequestAllowed({
        ...allowed,
        adsDisabled: true,
        entitlement: { storeLevel: 'free', serverTier: 'pro' },
      }),
    ).toBe(false);
  });

  it('keeps showing ads to an account no longer entitled to turn them off', () => {
    expect(adRequestAllowed({ ...allowed, adsDisabled: true })).toBe(true);
  });
});
