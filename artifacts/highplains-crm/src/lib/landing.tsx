import { Redirect } from "wouter";
import { BILLING_LANDING, isBillingPerson, type BillingAccessUser } from "@/lib/billing";

type LandingUser = BillingAccessUser & { isSuperAdminBool?: boolean };

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

export function LoginLandingRedirect({ user }: { user: BillingAccessUser }) {
  return <Redirect to={loginLandingPath(user)} />;
}
