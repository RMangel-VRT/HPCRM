import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route, RouteProps } from "wouter";

interface ProtectedRouteProps extends RouteProps {
  path: string;
  component: () => React.JSX.Element;
  allowedRoles?: Array<"admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor">;
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
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/login" />
      </Route>
    );
  }

  // Super admin only routes
  if (superAdminOnly && !user.isSuperAdminBool) {
    return (
      <Route path={path}>
        <Redirect to="/access-denied" />
      </Route>
    );
  }

  // Role-based access control
  if (allowedRoles && !user.isSuperAdminBool && !allowedRoles.includes(user.activeRole)) {
    return (
      <Route path={path}>
        <Redirect to="/access-denied" />
      </Route>
    );
  }

  return <Route path={path} component={Component} />;
}
