import { describe, expect, it } from 'vitest';
import { shouldShowSponsoredAd } from './ad-placement';

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
