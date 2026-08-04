import React, { createContext, useContext, useEffect, useState } from 'react';
import { storage } from '@/utils/secure-storage';
import type { User } from '@workspace/api-client-react';

const TOKEN_KEY = 'schooler_token';
const USER_KEY = 'schooler_user';

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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStored() {
      try {
        const storedToken = await storage.getItemAsync(TOKEN_KEY);
        const storedUser = await storage.getItemAsync(USER_KEY);
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
    setToken(null);
    setUser(null);
  };

  const updateToken = async (newToken: string) => {
    await storage.setItemAsync(TOKEN_KEY, newToken);
    setToken(newToken);
  };

  return (
    <AuthContext.Provider
      value={{ token, user, isAuthenticated: !!token, isLoading, login, logout, updateToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
