const TOKEN_KEY = "schoolar_token";

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
