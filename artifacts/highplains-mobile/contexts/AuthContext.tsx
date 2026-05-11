import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { ApiError, apiRequest, loadToken, saveToken, setUnauthorizedHandler } from "@/lib/api";

export type Role =
  | "admin"
  | "office"
  | "field_manager"
  | "chemical_manager"
  | "field"
  | "irrigation_manager"
  | "shop_manager"
  | "mapping"
  | "landscape_supervisor"
  | "crew_supervisor";

export type AuthUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  language?: "en" | "es";
  activeCompanyId: string;
  activeRole: Role;
  isSuperAdminBool?: boolean;
};

type LoginResponse = {
  token: string;
  expiresAt: string;
  user: AuthUser;
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
    const token = await loadToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await apiRequest<AuthUser>("/api/m/me");
      setUser(me);
    } catch {
      // Token invalid/expired — api layer already cleared it.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // The api layer has already cleared the token; just clear in-memory user
      // so the AuthGate effect routes us back to /login.
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
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
      const deviceLabel = `${Platform.OS}-${Platform.Version ?? ""}`.slice(0, 120);
      const resp = await apiRequest<LoginResponse>("/api/m/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, deviceLabel }),
      });
      await saveToken(resp.token);
      setUser(resp.user);
    } catch (e) {
      // Surface the server's message verbatim — especially the role-gate 403
      // ("Mobile access is for crew supervisors. Contact your admin.").
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Login failed";
      setError(msg);
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiRequest("/api/m/auth/logout", { method: "POST" });
    } catch {}
    await saveToken(null);
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
