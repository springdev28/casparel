/**
 * @fileOverview Mobile navigation role: decides the app's initial and guarded route.
 * System connection: consumed by app/_layout.tsx; pure so every session state
 * has a unit test instead of being exercised only on a device.
 */

export interface SessionRouteState {
  /** True while stored credentials are still being restored. */
  isLoading: boolean;
  /** True once the onboarding flag has been read from storage. */
  onboardingReady: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  /** First expo-router segment of the current location, undefined at "/". */
  segment: string | undefined;
}

export type RouteDecision =
  /** State is still restoring: keep the native splash, decide nothing. */
  | { kind: 'wait' }
  /** The current screen is the correct one. */
  | { kind: 'stay' }
  /** Navigate, replacing history so the wrong screen never flashes back. */
  | { kind: 'replace'; route: '/login' | '/onboarding' | '/mobile' };

const AUTH_SEGMENTS = new Set(['login', 'register']);
/** Screens an authenticated, onboarded session may occupy. */
const AUTHENTICATED_SEGMENTS = new Set(['mobile', 'paywall']);

/**
 * One decision for every combination of restored session state and location.
 *
 * Invariants, in order:
 *  - Nothing is decided (and the splash stays up) until both credential
 *    restoration and the onboarding flag are complete, so the public or
 *    wrong screen can never flash before the real destination.
 *  - Signed out: only the credential screens are reachable.
 *  - Signed in with onboarding pending: only onboarding.
 *  - Signed in: the hosted workspace or the native paywall. Everything else
 *    (legacy native tabs, unknown routes) is replaced with the workspace.
 */
export function resolveInitialRoute(state: SessionRouteState): RouteDecision {
  if (state.isLoading || !state.onboardingReady) return { kind: 'wait' };

  if (!state.isAuthenticated) {
    return state.segment !== undefined && AUTH_SEGMENTS.has(state.segment)
      ? { kind: 'stay' }
      : { kind: 'replace', route: '/login' };
  }

  if (state.needsOnboarding) {
    return state.segment === 'onboarding'
      ? { kind: 'stay' }
      : { kind: 'replace', route: '/onboarding' };
  }

  return state.segment !== undefined && AUTHENTICATED_SEGMENTS.has(state.segment)
    ? { kind: 'stay' }
    : { kind: 'replace', route: '/mobile' };
}

/**
 * Whether the splash screen may come down: the session has been restored and
 * the current screen is the decided destination.
 */
export function routeIsSettled(state: SessionRouteState): boolean {
  return resolveInitialRoute(state).kind === 'stay';
}
