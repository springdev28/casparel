/**
 * @fileOverview Mobile support role: carries the "this session has ended" signal from a failed request to the provider that can sign somebody out.
 * System connection: the query client reports here; AuthContext listens and clears the session.
 */
/**
 * Getting "your session ended" from a request to the thing that can act on it.
 *
 * The query client is created at module scope, above every provider, so its
 * error handler cannot call a hook or reach the auth context. The alternative
 * -- moving the client inside the tree -- would recreate it on any re-render
 * above it and throw away every cached response with it.
 *
 * So this is the seam: one handler, registered by the provider that owns the
 * session, called by the query client that finds out first. Deliberately not
 * an event emitter with many listeners: signing out is one thing that happens
 * once, and several listeners racing to do it is how a phone ends up signing
 * out halfway.
 */

/** Whether a token is in memory, mirrored from AuthContext. */
let hasSession = false;

/** What to do about an ended session, registered by AuthContext. */
let onExpiry: (() => Promise<void>) | null = null;

/**
 * Whether a request could have carried a session.
 *
 * A 401 only means "your session ended" if a session was actually sent, and
 * the token lives in SecureStore, which is asynchronous -- a query error
 * handler cannot wait for it. AuthContext already holds the token in memory
 * and mirrors it here, so the answer is available at the moment it is needed.
 */
export function sessionTokenIsPresent(): boolean {
  return hasSession;
}

export function setSessionTokenPresent(present: boolean): void {
  hasSession = present;
}

export function onSessionExpired(handler: (() => Promise<void>) | null): void {
  onExpiry = handler;
}

/**
 * Report an ended session, at most once while one is being dealt with.
 *
 * Every screen has several queries in flight, so an expired token produces a
 * burst of 401s within a few milliseconds. Without the guard each one would
 * call sign-out, which clears storage and the cache and navigates -- several
 * times over, from handlers racing each other.
 */
let signingOut = false;

export async function reportSessionExpiry(): Promise<void> {
  if (signingOut || !onExpiry) return;
  signingOut = true;
  try {
    await onExpiry();
  } finally {
    signingOut = false;
  }
}
