import { Redirect, useRouter } from "wouter";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { PLANT_LIBRARY_PATH } from "./estimatesRail";

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

/** One notice per bookmark navigation, including React StrictMode effect replay. */
export function PlantPaletteRedirect() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const notified = useRef(false);
  useEffect(() => {
    if (notified.current) return;
    notified.current = true;
    toast({ description: t("paletteRetirement.redirectNotice") });
  }, [t, toast]);
  return <QueryPreservingRedirect to={PLANT_LIBRARY_PATH} />;
}
