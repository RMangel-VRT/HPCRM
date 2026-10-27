import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { SectionRail, type RailSection } from "@/components/nav/SectionRail";

export const ESTIMATES_BASE = "/dashboard/estimates";
export const HARDSCAPE_CATALOG_PATH = `${ESTIMATES_BASE}/catalogs/hardscape`;
export const PLANT_LIBRARY_PATH = "/dashboard/tools/plant-library";

export type EstimatesRailKey = "all" | "hardscape" | "plant_library";

/** True for estimates-hub sub pages (the board itself is matched separately). */
export function isEstimatesHubPage(location: string): boolean {
  return location.startsWith(`${ESTIMATES_BASE}/catalogs/`) || location.startsWith(`${ESTIMATES_BASE}/settings/`);
}

/** Pure section builder so every hub page renders one consistent rail. */
export function estimatesRailSections(t: (k: string) => string): RailSection[] {
  return [
    { items: [
      { key: "all", label: t("estimates.all"), href: ESTIMATES_BASE },
    ] },
    { label: t("estimates.catalogs"), items: [
      { key: "hardscape", label: t("estimates.hardscapeCatalog"), href: HARDSCAPE_CATALOG_PATH },
      { key: "plant_library", label: t("estimates.plantLibrary"), href: PLANT_LIBRARY_PATH },
    ] },
    // Settings: provisioned for Slice 2.3 (Labor & Rates, QuickBooks Setup). Empty sections are not rendered.
    { label: t("estimates.settings"), items: [] },
  ];
}

export function EstimatesRail({ activeKey }: { activeKey: EstimatesRailKey }): JSX.Element {
  const { t } = useTranslation();
  return (
    <SectionRail
      title={t("estimates.title")}
      ariaLabel={t("estimates.railLabel")}
      activeKey={activeKey}
      sections={estimatesRailSections(t)}
    />
  );
}
