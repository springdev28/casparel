/**
 * @fileOverview Verification role: exercises Session Expiry.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Ending a session: what counts as one, and what happens once it does.
 *
 * A 401 treated as expiry signs somebody out. A 401 not treated as expiry
 * leaves them inside an app where every panel fails, being told to sign in
 * again, with no route to the sign-in screen — which is what this app did
 * until the rule reached it. Both mistakes are silent, so the rule is one
 * shared function and this is where it is pinned.
 *
 * The interesting cases are the ones that must *not* eject anybody. A wrong
 * password at sign-in answers 401 and has to keep saying "email or password is
 * incorrect". Account reset and deletion answer 401 for a wrong *current*
 * password, which is failed reauthentication rather than an ended session.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { isSessionExpiry } from '@workspace/api-client-react';
import {
  onSessionExpired,
  reportSessionExpiry,
  sessionTokenIsPresent,
  setSessionTokenPresent,
} from './session-expiry';

const failure = (
  status: number,
  url = 'https://casparel.com/api/learning-goals',
  data: unknown = null,
) => ({ status, url, data });

describe('what counts as an ended session', () => {
  it('is a 401 on an ordinary request made with a session', () => {
    expect(isSessionExpiry(failure(401), true)).toBe(true);
  });

  it('is not a 401 from a request made with no session', () => {
    // Signed out already: there is nobody to eject, and acting on it would
    // clear storage every time a signed-out screen probed the API.
    expect(isSessionExpiry(failure(401), false)).toBe(false);
  });

  it('is not a wrong password at sign-in', () => {
    expect(isSessionExpiry(failure(401, 'https://casparel.com/api/auth/login'), true)).toBe(
      false,
    );
    expect(
      isSessionExpiry(failure(401, 'https://casparel.com/api/auth/register'), true),
    ).toBe(false);
  });

  it('is not a wrong current password when closing or resetting an account', () => {
    expect(
      isSessionExpiry(
        failure(401, 'https://casparel.com/api/users/me', {
          error: 'Current password is incorrect',
        }),
        true,
      ),
    ).toBe(false);
  });

  it('is not any other failure', () => {
    for (const status of [400, 403, 404, 429, 500, 503]) {
      expect(isSessionExpiry(failure(status), true), `HTTP ${status}`).toBe(false);
    }
  });

  it('is not something that is not a request failure at all', () => {
    expect(isSessionExpiry(null, true)).toBe(false);
    expect(isSessionExpiry(new Error('network'), true)).toBe(false);
    expect(isSessionExpiry(undefined, true)).toBe(false);
  });

  /*
   * A credential path that appears somewhere other than the end of the URL is
   * a different endpoint. Matching it loosely would leave a wrong password on
   * one route stopping an ejection from another.
   */
  it('matches the credential endpoints at the end of the path, not anywhere in it', () => {
    expect(
      isSessionExpiry(failure(401, 'https://casparel.com/api/auth/login/history'), true),
    ).toBe(true);
  });
});

describe('acting on it', () => {
  beforeEach(() => {
    onSessionExpired(null);
    setSessionTokenPresent(false);
  });

  it('mirrors whether a request could have carried a session', () => {
    expect(sessionTokenIsPresent()).toBe(false);
    setSessionTokenPresent(true);
    expect(sessionTokenIsPresent()).toBe(true);
  });

  it('does nothing when no handler is registered', async () => {
    await expect(reportSessionExpiry()).resolves.toBeUndefined();
  });

  /*
   * The reason the guard exists. Every screen has several queries in flight,
   * so an expired token produces a burst of 401s within a few milliseconds.
   * Without it each one signs out -- clearing storage, emptying the cache and
   * navigating -- several times over, from handlers racing each other.
   */
  it('signs out once for a burst of failures, not once per failure', async () => {
    let signOuts = 0;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    onSessionExpired(async () => {
      signOuts += 1;
      await held;
    });

    const reports = [
      reportSessionExpiry(),
      reportSessionExpiry(),
      reportSessionExpiry(),
    ];
    expect(signOuts).toBe(1);
    release();
    await Promise.all(reports);
    expect(signOuts).toBe(1);
  });

  it('can sign out again after the first one has finished', async () => {
    let signOuts = 0;
    onSessionExpired(async () => {
      signOuts += 1;
    });
    await reportSessionExpiry();
    await reportSessionExpiry();
    expect(signOuts).toBe(2);
  });
});
