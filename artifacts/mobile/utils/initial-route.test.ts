import { describe, expect, it } from 'vitest';
import { resolveInitialRoute, routeIsSettled } from './initial-route';

const base = {
  isLoading: false,
  onboardingReady: true,
  isAuthenticated: false,
  needsOnboarding: false,
  segment: undefined as string | undefined,
};

describe('resolveInitialRoute', () => {
  it('decides nothing while credentials are still restoring', () => {
    expect(resolveInitialRoute({ ...base, isLoading: true })).toEqual({ kind: 'wait' });
    expect(
      resolveInitialRoute({ ...base, isLoading: true, isAuthenticated: true, segment: 'mobile' }),
    ).toEqual({ kind: 'wait' });
  });

  it('decides nothing until the onboarding flag has been read', () => {
    expect(resolveInitialRoute({ ...base, onboardingReady: false })).toEqual({ kind: 'wait' });
  });

  it('sends a signed-out session to the in-app login, never the public site', () => {
    expect(resolveInitialRoute({ ...base, segment: undefined })).toEqual({
      kind: 'replace',
      route: '/login',
    });
    expect(resolveInitialRoute({ ...base, segment: 'mobile' })).toEqual({
      kind: 'replace',
      route: '/login',
    });
    expect(resolveInitialRoute({ ...base, segment: 'paywall' })).toEqual({
      kind: 'replace',
      route: '/login',
    });
  });

  it('keeps both credential screens reachable while signed out', () => {
    expect(resolveInitialRoute({ ...base, segment: 'login' })).toEqual({ kind: 'stay' });
    expect(resolveInitialRoute({ ...base, segment: 'register' })).toEqual({ kind: 'stay' });
  });

  it('routes a first sign-in through onboarding exactly once', () => {
    const authed = { ...base, isAuthenticated: true, needsOnboarding: true };
    expect(resolveInitialRoute({ ...authed, segment: undefined })).toEqual({
      kind: 'replace',
      route: '/onboarding',
    });
    expect(resolveInitialRoute({ ...authed, segment: 'onboarding' })).toEqual({ kind: 'stay' });
  });

  it('opens the authenticated workspace directly, with no landing page in between', () => {
    const authed = { ...base, isAuthenticated: true };
    expect(resolveInitialRoute({ ...authed, segment: undefined })).toEqual({
      kind: 'replace',
      route: '/mobile',
    });
    expect(resolveInitialRoute({ ...authed, segment: 'login' })).toEqual({
      kind: 'replace',
      route: '/mobile',
    });
  });

  it('lets an authenticated session stay on the workspace and the paywall', () => {
    const authed = { ...base, isAuthenticated: true };
    expect(resolveInitialRoute({ ...authed, segment: 'mobile' })).toEqual({ kind: 'stay' });
    expect(resolveInitialRoute({ ...authed, segment: 'paywall' })).toEqual({ kind: 'stay' });
  });

  it('replaces the legacy native screens with the hosted workspace', () => {
    const authed = { ...base, isAuthenticated: true };
    for (const segment of ['(tabs)', 'workspace', 'resource', 'goals', 'messages', 'lists']) {
      expect(resolveInitialRoute({ ...authed, segment })).toEqual({
        kind: 'replace',
        route: '/mobile',
      });
    }
  });
});

describe('routeIsSettled', () => {
  it('keeps the splash up until the session lands on its destination', () => {
    expect(routeIsSettled({ ...base, isLoading: true })).toBe(false);
    expect(routeIsSettled({ ...base, segment: undefined })).toBe(false);
    expect(routeIsSettled({ ...base, segment: 'login' })).toBe(true);
    expect(
      routeIsSettled({ ...base, isAuthenticated: true, segment: 'mobile' }),
    ).toBe(true);
  });
});
