import { Redirect, useRouter } from "wouter";
import { PLANT_PALETTES_PATH } from "./estimatesRail";

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

export function SeasonsRedirect() {
  return <QueryPreservingRedirect to="/dashboard/settings/seasons" />;
}

/** Read the raw pathname: Wouter params decode spaces but retain encoded delimiters. */
export function PlantPaletteRedirect() {
  const router = useRouter();
  const [pathname] = router.hook(router);
  const id = pathname.slice(pathname.lastIndexOf("/") + 1);
  return <QueryPreservingRedirect to={`${PLANT_PALETTES_PATH}/${id}`} />;
}
