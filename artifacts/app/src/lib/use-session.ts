import { useSyncExternalStore } from "react";
import {
  readSessionClaims,
  readSessionToken,
  subscribeToSession,
  type SessionClaims,
} from "./session";

/**
 * The current session, as reactive state.
 *
 * Route guards previously called localStorage.getItem during render. That
 * reads the right value once and then never updates: React has no reason to
 * re-render when localStorage changes, so a session cleared mid-visit left the
 * signed-in shell on screen with every request failing behind it.
 *
 * The token string is the store snapshot rather than the decoded claims,
 * because useSyncExternalStore compares snapshots by identity and decoding
 * would return a fresh object every call, which loops forever.
 */
export function useSessionToken(): string | null {
  return useSyncExternalStore(
    subscribeToSession,
    readSessionToken,
    // Server snapshot: prerender as signed out rather than touching storage.
    () => null,
  );
}

/**
 * Decoded claims for the current session, or null when signed out OR expired.
 *
 * Prefer this over a bare token check in route guards: a token that is present
 * but past its expiry is not a session, and treating it as one is exactly what
 * kept expired users inside the app.
 */
export function useSessionClaims(): SessionClaims | null {
  const token = useSessionToken();
  // Recomputed only when the token itself changes.
  return token ? readSessionClaims() : null;
}
