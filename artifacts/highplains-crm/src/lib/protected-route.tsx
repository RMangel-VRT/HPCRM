import { useAuth } from "@/hooks/use-auth";
import { accessRole } from "../../../../lib/db/src/accessRole";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { LoginRequiredRedirect } from "@/lib/landing";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType;
  allowedRoles?: Array<import("../../../../lib/db/src/accessRole").Role>;
  superAdminOnly?: boolean;
  /** Extra access predicate (e.g. canViewBilling), replaces role list when given. */
  access?: (user: NonNullable<ReturnType<typeof useAuth>["user"]>) => boolean;
}

export function ProtectedRoute({
  path,
  component: Component,
  allowedRoles,
  superAdminOnly = false,
  access,
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
        {() => <LoginRequiredRedirect />}
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

  if (access && !user.isSuperAdminBool && !access(user)) {
    return (
      <Route path={path}>
        {() => <Redirect to="/access-denied" />}
      </Route>
    );
  }

  if (allowedRoles && !user.isSuperAdminBool && !allowedRoles.includes(accessRole(user.activeRole))) {
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
