/**
 * @fileOverview Web domain role: centralizes Session state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
const TOKEN_KEY = "schoolar_token";
const SESSION_EVENT = "schoolar-session-change";

export interface SessionClaims {
  userId: number;
  /** The role the session is acting as. */
  role: "student" | "teacher" | "admin";
  /** The underlying account role. */
  accountRole: "student" | "teacher" | "admin";
}

const VALID_ROLES = new Set(["student", "teacher", "admin"]);

/**
 * Read the signed-in user's claims straight from the stored token.
 *
 * This is a *display* fallback only, the server remains the sole authority and
 * re-checks every request. It exists so that a slow or failing `GET /users/me`
 * cannot blank out the whole sidebar (profile, plan, role switcher), which is
 * otherwise gated on that single call.
 */
export function readSessionClaims(): SessionClaims | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  const segment = raw.split(".")[1];
  if (!segment) return null;

  try {
    const json = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as Partial<SessionClaims> & {
      exp?: number;
    };
    if (!Number.isSafeInteger(payload.userId) || Number(payload.userId) <= 0) {
      return null;
    }
    /*
     * Milliseconds, not seconds.
     *
     * A standard JWT `exp` is in seconds, and this multiplied by 1000 to
     * match. This server does not issue a standard JWT: lib/auth.ts signs
     * `exp: Date.now() + TOKEN_TTL_MS` and verifies with `payload.exp <
     * Date.now()`, both in milliseconds. Multiplying made every expiry sit
     * about a thousand times further in the future than it is, so no token
     * was ever read as expired here: a signed-out-by-expiry session stayed
     * on the dashboard with a dead token until some request returned 401.
     */
    if (typeof payload.exp === "number" && payload.exp <= Date.now()) {
      return null;
    }
    const role = VALID_ROLES.has(String(payload.role))
      ? (payload.role as SessionClaims["role"])
      : "student";
    const accountRole = VALID_ROLES.has(String(payload.accountRole))
      ? (payload.accountRole as SessionClaims["accountRole"])
      : role;
    return { userId: Number(payload.userId), role, accountRole };
  } catch {
    return null;
  }
}

/**
 * Make the stored session observable.
 *
 * Route guards used to read localStorage during render. localStorage is not
 * reactive, so clearing the token changed nothing on screen: an expired or
 * revoked session left the user sitting inside the signed-in app with every
 * request failing and no way back to the login page except a manual reload.
 *
 * Two events matter. The browser's own `storage` event covers other tabs -
 * signing out in one tab should not leave the others in a dead session - but
 * it deliberately does not fire in the tab that made the change, so writes in
 * this tab announce themselves through a custom event.
 */
export function subscribeToSession(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    // key is null when the whole store is cleared.
    if (event.key === null || event.key === TOKEN_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SESSION_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SESSION_EVENT, onChange);
  };
}

/** Snapshot for useSyncExternalStore: the raw token, or null. */
export function readSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Drop the session and tell every subscriber in this tab.
 *
 * Everything that signs a user out goes through here so no caller can forget
 * the notification and leave the UI showing a session that no longer exists.
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // A storage failure must not stop the rest of the sign-out.
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
  notifyNativeShell({ type: "logout" });
}

/**
 * Remove browser state owned by one Casparel account.
 *
 * Server-side reset is not enough: search drafts, tutorial progress, cached
 * colors, dismissed workflow cards, and dashboard selections also live in
 * browser storage. Leaving those behind makes a reset appear not to work and
 * can show the next account state written by the previous one on a shared
 * computer. Product keys have always used the schoolar_/casparel_ prefixes;
 * unrelated data on the same origin is deliberately left untouched.
 *
 * Reset keeps the current auth token so the account remains signed in. Delete
 * does not, and still calls clearSession afterwards to notify React listeners.
 */
export function clearLocalAccountData(options?: {
  preserveSession?: boolean;
}): void {
  const preservedToken = options?.preserveSession ? readSessionToken() : null;
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const ownedKeys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && /^(?:schoolar_|casparel_|eduhub_)/.test(key)) {
          ownedKeys.push(key);
        }
      }
      for (const key of ownedKeys) storage.removeItem(key);
    } catch {
      // Storage can be blocked; the server reset remains authoritative.
    }
  }
  if (preservedToken) {
    try {
      localStorage.setItem(TOKEN_KEY, preservedToken);
    } catch {
      // The subsequent request will simply behave as signed out.
    }
  }
}

/** Announce a token that was just written (sign-in, token refresh). */
export function notifySessionChanged(): void {
  window.dispatchEvent(new Event(SESSION_EVENT));
  const token = readSessionToken();
  if (token) notifyNativeShell({ type: "session", token });
}

function notifyNativeShell(message: { type: "logout" } | { type: "session"; token: string }): void {
  try {
    if (localStorage.getItem("casparel_native_shell") !== "true") return;
    const bridge = (window as typeof window & {
      ReactNativeWebView?: { postMessage: (value: string) => void };
    }).ReactNativeWebView;
    bridge?.postMessage(JSON.stringify(message));
  } catch {
    // A browser without the native bridge continues normally.
  }
}
