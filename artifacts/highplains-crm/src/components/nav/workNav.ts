import type { NavRole } from "./navConfig";

export type WorkFamily = "tickets" | "maps" | "campaigns" | "plants";
type WorkItem = { key: string; labelKey: string; href: string; roles: readonly string[] };
const AO = ["admin", "office"];
export const WORK_VIEWS: Record<WorkFamily, WorkItem[]> = {
  tickets: [
    { key: "mine", labelKey: "workRail.mine", href: "/dashboard/tickets/my", roles: [...AO, "field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor", "crew_supervisor"] },
    { key: "batches", labelKey: "workRail.batches", href: "/dashboard/my-batches", roles: [...AO, "field", "field_manager", "landscape_supervisor"] },
    { key: "all", labelKey: "workRail.all", href: "/dashboard/tickets", roles: AO },
  ],
  maps: [
    { key: "property-maps", labelKey: "nav.propertyMaps", href: "/dashboard/maps", roles: [...AO, "mapping", "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"] },
    { key: "route-map", labelKey: "nav.routeMap", href: "/dashboard/customers/map", roles: ["admin", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor"] },
  ],
  campaigns: [
    { key: "campaigns", labelKey: "nav.campaigns", href: "/dashboard/campaigns", roles: [...AO, "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"] },
    { key: "checklists", labelKey: "nav.serviceChecklists", href: "/dashboard/campaigns/checklists", roles: [...AO, "field_manager", "chemical_manager"] },
  ],
  plants: [
    { key: "library", labelKey: "workRail.library", href: "/dashboard/tools/plant-library", roles: AO },
    { key: "matches", labelKey: "workRail.matches", href: "/dashboard/tools/plant-matches", roles: AO },
    { key: "palettes", labelKey: "workRail.palettes", href: "/dashboard/tools/plant-palette", roles: AO },
  ],
};

export function workViewsFor(family: WorkFamily, role?: string | null) {
  return WORK_VIEWS[family].filter(item => role && item.roles.includes(role));
}

export function workPage(path: string): { family: WorkFamily; activeKey: string } | undefined {
  for (const family of Object.keys(WORK_VIEWS) as WorkFamily[]) {
    const item = WORK_VIEWS[family].find(item => path === item.href ||
      (family === "plants" && item.key === "palettes" && /^\/dashboard\/tools\/plant-palette\/[^/]+$/.test(path)));
    if (item) return { family, activeKey: item.key };
  }
  return undefined;
}

export function firstMapHref(role: NavRole) {
  return workViewsFor("maps", role)[0]?.href;
}
