/** Browser/server-safe standard scope policy, using the caller's existing catalog. */
export interface ScopeDefault {
  key: string; label: string; line: "landscape" | "irrigation" | "snow"; wordModule: string | null;
  unit: string | null; defaultQuantity: number | null; defaultMonthSpread: number[] | null;
}
const HOA = new Set(["mowing", "aeration", "cleanups", "shrub_trimming", "chemical", "winter_visits",
  "irrigation_open", "irrigation_inspection", "irrigation_winterization", "backflow"]);
const SNOW = new Set(["snow_walks", "snow_drives", "ice_melt", "snow_stakes"]);
export const standardScopeIncludes = (key: string, line: string) => (line === "snow" ? SNOW : HOA).has(key);
export function initialScope(line: "landscape" | "snow" | "both", catalog: readonly ScopeDefault[]) {
  return catalog.filter(c => line === "both" || (line === "snow" ? c.line === "snow" : c.line !== "snow")).map(c => ({
    serviceKey: c.key, label: c.label, line: c.line, wordModule: c.wordModule, existed: false,
    included: standardScopeIncludes(c.key, c.line),
    quantity: c.defaultQuantity, unit: c.unit, monthSpread: c.defaultMonthSpread ? [...c.defaultMonthSpread] : null,
    details: {} as Record<string, unknown>, priceCents: null as number | null, notes: null as string | null,
  }));
}
