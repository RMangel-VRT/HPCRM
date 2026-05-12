import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType;
  allowedRoles?: Array<"admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor" | "crew_supervisor">;
  superAdminOnly?: boolean;
}

export function ProtectedRoute({
  path,
  component: Component,
  allowedRoles,
  superAdminOnly = false,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        {() => (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        {() => <Redirect to="/login" />}
      </Route>
    );
  }

  if (superAdminOnly && !user.isSuperAdminBool) {
    return (
      <Route path={path}>
        {() => <Redirect to="/access-denied" />}
      </Route>
    );
  }

  if (allowedRoles && !user.isSuperAdminBool && !allowedRoles.includes(user.activeRole)) {
    return (
      <Route path={path}>
        {() => <Redirect to="/access-denied" />}
      </Route>
    );
  }

  return (
    <Route path={path}>
      {() => <Component />}
    </Route>
  );
}
