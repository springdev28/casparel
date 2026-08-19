import React, { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { storage } from "@/utils/secure-storage";
import type { User } from "@workspace/api-client-react";

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
        if (storedToken) {
          setToken(storedToken);
        }
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch {
            // ignore parse errors
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadStored();
  }, []);

  const login = async (newToken: string, newUser: User) => {
    await storage.setItemAsync(TOKEN_KEY, newToken);
    await storage.setItemAsync(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    await storage.deleteItemAsync(TOKEN_KEY);
    await storage.deleteItemAsync(USER_KEY);
    await storage.deleteItemAsync(LEGACY_USER_KEY);
    setToken(null);
    setUser(null);
    /*
     * The answers, not just the key to ask for more.
     *
     * Signing out cleared the token and the stored user and left every cached
     * response in memory: the schedule, the classes, the profile, the activity
     * feed. QueryClientProvider sits above this provider, so nothing unmounts
     * it and nothing empties it. The next person to sign in on the same phone
     * mounts those screens, and React Query hands them the cached entry first
     * and refetches behind it -- so they are shown the last person's day
     * before their own arrives.
     *
     * Schools share devices. That is the case, not the edge case.
     *
     * The web app has cleared the cache on sign-out for this reason; this is
     * the same line. Reasoned from the code rather than filmed: Alert.alert's
     * buttons do not fire on react-native-web, so the harness that renders
     * this app cannot press "Sign out" to watch it happen.
     */
    queryClient.clear();
  };

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
