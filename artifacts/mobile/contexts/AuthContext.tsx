/**
 * @fileOverview Mobile state role: owns the app-wide Auth Context context and lifecycle.
 * System connection: installed by app/_layout.tsx and consumed by screens/components that need shared account state.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { storage } from "@/utils/secure-storage";
import {
  setUnauthorizedHandler,
  type User,
} from "@workspace/api-client-react";

const TOKEN_KEY = "schoolar_token";
const USER_KEY = "casparel_user";
const LEGACY_USER_KEY = "schooler_user";

interface AuthContextValue {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  updateToken: (newToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Stored profile data is a display cache; require its stable identity fields. */
function parseStoredUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<User>;
    return Number.isSafeInteger(value.id) &&
      Number(value.id) > 0 &&
      typeof value.name === "string" &&
      typeof value.email === "string"
      ? (value as User)
      : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStored() {
      try {
        const storedToken = await storage.getItemAsync(TOKEN_KEY);
        const currentUser = await storage.getItemAsync(USER_KEY);
        const legacyUser = currentUser
          ? null
          : await storage.getItemAsync(LEGACY_USER_KEY);
        const storedUser = currentUser ?? legacyUser;
        if (legacyUser) {
          await storage.setItemAsync(USER_KEY, legacyUser);
          await storage.deleteItemAsync(LEGACY_USER_KEY);
        }
        const parsedUser = parseStoredUser(storedUser);
        if (storedToken && parsedUser) {
          setToken(storedToken);
          setUser(parsedUser);
        } else if (storedToken || storedUser) {
          // A half-written or corrupt session cannot safely identify an
          // account. Clear both halves instead of entering the app with a token
          // but no user (or vice versa).
          await Promise.allSettled([
            storage.deleteItemAsync(TOKEN_KEY),
            storage.deleteItemAsync(USER_KEY),
            storage.deleteItemAsync(LEGACY_USER_KEY),
          ]);
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadStored();
  }, []);

  const login = useCallback(async (newToken: string, newUser: User) => {
    try {
      await storage.setItemAsync(TOKEN_KEY, newToken);
      await storage.setItemAsync(USER_KEY, JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    } catch (error) {
      // Roll back a partial write so the next clean launch cannot restore a
      // token without its matching profile cache.
      await Promise.allSettled([
        storage.deleteItemAsync(TOKEN_KEY),
        storage.deleteItemAsync(USER_KEY),
      ]);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await Promise.allSettled([
      storage.deleteItemAsync(TOKEN_KEY),
      storage.deleteItemAsync(USER_KEY),
      storage.deleteItemAsync(LEGACY_USER_KEY),
    ]);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    // Generated API calls all pass through customFetch. Expired/revoked
    // sessions therefore leave the native shell in one place, clear cached
    // private data, and let RootLayoutNav return to login.
    setUnauthorizedHandler(async () => {
      await logout();
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout, queryClient]);

  const updateToken = async (newToken: string) => {
    await storage.setItemAsync(TOKEN_KEY, newToken);
    setToken(newToken);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
        updateToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
