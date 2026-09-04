import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A localStorage the node test environment does not otherwise have. Defined
 * before the module under test is imported, since it reads storage lazily.
 */
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  },
});

const { readSessionClaims } = await import("./session");

/**
 * The token this server actually issues.
 *
 * `exp` and `iat` are milliseconds, because lib/auth.ts signs
 * `exp: Date.now() + TOKEN_TTL_MS` and verifies with `payload.exp <
 * Date.now()`. That is not what a standard JWT does, and reading it as
 * seconds is the mistake this file exists to prevent: it made every expiry
 * land about a thousand years out, so no session was ever read as expired.
 */
function token(payload: Record<string, unknown>): string {
  const part = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.signature`;
}

const base = { userId: 7, role: "student", accountRole: "student" };

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function storeToken(value: string) {
  localStorage.setItem("schoolar_token", value);
}

describe("readSessionClaims", () => {
  it("reads a live session", () => {
    storeToken(token({ ...base, exp: Date.now() + 60_000 }));
    expect(readSessionClaims()).toEqual({
      userId: 7,
      role: "student",
      accountRole: "student",
    });
  });

  it("refuses a token whose millisecond expiry has passed", () => {
    storeToken(token({ ...base, exp: Date.now() - 1 }));
    expect(readSessionClaims()).toBeNull();
  });

  it("refuses one that expired days ago", () => {
    storeToken(token({ ...base, exp: Date.now() - 7 * 24 * 60 * 60 * 1000 }));
    expect(readSessionClaims()).toBeNull();
  });

  it("does not read the expiry as seconds", () => {
    // A token that expired an hour ago. Read as seconds it would appear to
    // expire in the year 57000 and the dead session would look live, which
    // is exactly the defect: the app stayed on the dashboard with a token
    // every request would reject.
    const anHourAgo = Date.now() - 60 * 60 * 1000;
    storeToken(token({ ...base, exp: anHourAgo }));
    expect(readSessionClaims()).toBeNull();
  });

  it("accepts a token with no expiry claim at all", () => {
    // The server always sends one; a token without it is not evidence of
    // expiry, and the server re-checks every request regardless.
    storeToken(token(base));
    expect(readSessionClaims()).not.toBeNull();
  });

  it("refuses a malformed or absent token", () => {
    expect(readSessionClaims()).toBeNull();
    storeToken("not-a-token");
    expect(readSessionClaims()).toBeNull();
    storeToken(token({ ...base, userId: 0 }));
    expect(readSessionClaims()).toBeNull();
  });
});
