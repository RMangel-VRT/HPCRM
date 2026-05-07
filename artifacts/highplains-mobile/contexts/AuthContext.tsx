import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiRequest, saveCookie } from "@/lib/api";

export type Role =
  | "admin"
  | "office"
  | "field_manager"
  | "chemical_manager"
  | "field"
  | "irrigation_manager"
  | "shop_manager"
  | "mapping"
  | "landscape_supervisor";

export type AuthUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  language?: "en" | "es";
  activeCompanyId: string;
  activeRole: Role;
  isSuperAdminBool?: boolean;
  activeCompany?: { id: string; name: string } | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await apiRequest<AuthUser>("/api/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (username: string, password: string) => {
    setSigningIn(true);
    setError(null);
    try {
      const me = await apiRequest<AuthUser>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setUser(me);
    } catch (e: any) {
      setError(e?.message || "Login failed");
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {}
    await saveCookie(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signingIn, error, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
