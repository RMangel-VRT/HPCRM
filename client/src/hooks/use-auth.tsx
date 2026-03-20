import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User, Company } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export type UserWithCompanyContext = Omit<User, "passwordHash"> & {
  activeCompanyId: string;
  activeRole: "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor";
  isSuperAdminBool: boolean;
  activeCompany?: Company | null;
};

type AuthContextType = {
  user: UserWithCompanyContext | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<UserWithCompanyContext, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  switchCompanyMutation: UseMutationResult<UserWithCompanyContext, Error, string>;
};

type LoginData = {
  username: string;
  password: string;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<UserWithCompanyContext | undefined, Error>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/auth/login", credentials);
      return await res.json();
    },
    onSuccess: (user: UserWithCompanyContext) => {
      queryClient.setQueryData(["/api/auth/me"], user);
    },
    onError: (error: Error) => {
      toast({
        title: t("auth.loginFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
    },
    onError: (error: Error) => {
      toast({
        title: t("auth.logoutFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const switchCompanyMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await apiRequest("POST", "/api/user/switch-company", { companyId });
      return await res.json();
    },
    onSuccess: (user: UserWithCompanyContext) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/users"] });
      toast({
        title: t("auth.companySwitched"),
        description: t("auth.nowViewing", { company: user.activeCompany?.name || t("common.unknown") }),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("auth.switchFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        switchCompanyMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
