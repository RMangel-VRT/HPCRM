import { Redirect } from "wouter";
import { BILLING_LANDING, isBillingPerson, type BillingAccessUser } from "@/lib/billing";

type LandingUser = BillingAccessUser & { isSuperAdminBool?: boolean };

/** Reject encoded normalization too; never let a browser reinterpret the route. */
export function safeLoginNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/dashboard/") || /[\\\u0000-\u001f\u007f]/.test(next)) return null;
  // Query values cannot change the navigation origin. Preserve them verbatim,
  // including encoded spaces, literal percent signs and nested URLs.
  let decoded = next.split(/[?#]/)[0];
  for (let i = 0; i < 8; i++) {
    if (!decoded.startsWith("/dashboard/") || /[\\\u0000-\u0020\u007f?#]/.test(decoded)) return null;
    if (decoded.split("/").some(part => part === "." || part === "..") || decoded.includes("//")) return null;
    try {
      const value = decodeURIComponent(decoded);
      if (value === decoded) return next;
      decoded = value;
    } catch { return null; }
  }
  return null;
}

export const loginDestination = (user: LandingUser, search: string) =>
  safeLoginNext(new URLSearchParams(search).get("next")) ?? loginLandingPath(user);

export const loginRedirectPath = (pathname: string, search: string) =>
  pathname.startsWith("/dashboard/") ? `/login?next=${encodeURIComponent(pathname + search)}` : "/login";

/** Used by both top-level signed-out branches as well as individual guards. */
export function LoginRequiredRedirect() {
  return <Redirect to={typeof window === "undefined" ? "/login" : loginRedirectPath(window.location.pathname, window.location.search)} />;
}

/** Post-login target: billing has priority; other users land on a route their role permits. */
export const loginLandingPath = (user: LandingUser): string => {
  if (isBillingPerson(user)) return BILLING_LANDING;
  if (user.isSuperAdminBool) return "/admin";
  if (user.activeRole === "mapping") return "/dashboard/maps";
  if (user.activeRole === "crew_supervisor") return "/dashboard/tickets/my";
  return "/dashboard";
};

/** Target for "/" and unknown URLs. */
export function defaultRedirectPath(user: LandingUser | null | undefined): string {
  if (!user) return "/login";
  if (isBillingPerson(user)) return BILLING_LANDING;
  if (user.isSuperAdminBool) return "/admin";
  if (user.activeRole === "mapping") return "/dashboard/maps";
  if (user.activeRole === "crew_supervisor") return "/dashboard/tickets/my";
  return loginLandingPath(user);
}

export function DefaultRedirect({ user }: { user: LandingUser | null | undefined }) {
  return <Redirect to={defaultRedirectPath(user)} />;
}

export function LoginLandingRedirect({ user, search = "" }: { user: LandingUser; search?: string }) {
  return <Redirect to={loginDestination(user, search)} />;
}
