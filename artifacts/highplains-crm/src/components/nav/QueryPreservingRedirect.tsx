import { Redirect, useRouter } from "wouter";

/** Keep deep-link filters when retiring a navigation entry or route alias. */
export function QueryPreservingRedirect({ to }: { to: string }) {
  const router = useRouter();
  // useSearch() decodes the string, which can corrupt encoded delimiters.
  const search = router.searchHook(router).replace(/^\?/, "");
  return <Redirect to={search ? `${to}?${search}` : to} />;
}

export function OperationsRedirect() {
  return <QueryPreservingRedirect to="/dashboard/campaigns" />;
}
