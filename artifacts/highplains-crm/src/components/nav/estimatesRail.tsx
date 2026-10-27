import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { SectionRail, type RailSection } from "@/components/nav/SectionRail";

export const ESTIMATES_BASE = "/dashboard/estimates";
export const HARDSCAPE_CATALOG_PATH = `${ESTIMATES_BASE}/catalogs/hardscape`;
export const IRRIGATION_CATALOG_PATH = `${ESTIMATES_BASE}/catalogs/irrigation`;
export const PLANT_LIBRARY_PATH = `${ESTIMATES_BASE}/catalogs/plants`;
export const EQUIPMENT_FEES_PATH = `${ESTIMATES_BASE}/catalogs/equipment-fees`;
export const LABOR_RATES_PATH = `${ESTIMATES_BASE}/settings/rates`;
export const QUICKBOOKS_SETUP_PATH = `${ESTIMATES_BASE}/settings/quickbooks`;
export const PLANT_MATCHES_PATH = `${PLANT_LIBRARY_PATH}/matches`;
export const PLANT_PALETTES_PATH = `${PLANT_LIBRARY_PATH}/palettes`;

export type EstimatesRailKey = "all" | "hardscape" | "irrigation" | "plant_library" | "library" | "matches" | "palettes" | "equipment_fees" | "labor_rates" | "quickbooks";

/** Only plant pages use the shared outer shell; the board and hardscape own theirs. */
export function plantRailKey(path: string): EstimatesRailKey | undefined {
  if (path === PLANT_LIBRARY_PATH) return "library";
  if (path === PLANT_MATCHES_PATH) return "matches";
  if (path === PLANT_PALETTES_PATH || new RegExp(`^${PLANT_PALETTES_PATH}/[^/]+$`).test(path)) return "palettes";
  return undefined;
}

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
      { key: "irrigation", label: t("estimates.irrigationCatalog"), href: IRRIGATION_CATALOG_PATH },
      { key: "plant_library", label: t("estimates.plantLibrary"), href: PLANT_LIBRARY_PATH },
      { key: "library", label: t("workRail.library"), href: PLANT_LIBRARY_PATH, indented: true },
      { key: "matches", label: t("workRail.matches"), href: PLANT_MATCHES_PATH, indented: true },
      { key: "palettes", label: t("workRail.palettes"), href: PLANT_PALETTES_PATH, indented: true },
      { key: "equipment_fees", label: t("estimates.equipmentFees"), href: EQUIPMENT_FEES_PATH },
    ] },
    { label: t("estimates.settings"), items: [
      { key: "labor_rates", label: t("estimates.laborRates"), href: LABOR_RATES_PATH },
      { key: "quickbooks", label: t("estimates.quickbooksSetup"), href: QUICKBOOKS_SETUP_PATH },
    ] },
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
