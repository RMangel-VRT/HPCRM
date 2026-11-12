/** Browser/server-safe standard scope policy, using the caller's existing catalog. */
export interface ScopeDefault {
  key: string; label: string; line: "landscape" | "irrigation" | "snow"; wordModule: string | null;
  unit: string | null; defaultQuantity: number | null; defaultMonthSpread: number[] | null;
  scheduling?: string; packageDefault?: boolean;
}
export interface PackageCalendarEntry { serviceKey: string; inStandard: boolean; kind: string }
export const inStandardPackage = (service: Pick<ScopeDefault, "key" | "packageDefault">, calendar: readonly PackageCalendarEntry[]) =>
  service.packageDefault !== false && calendar.some(e => e.serviceKey === service.key && e.inStandard);
export const standardRoundCount = (key: string, calendar: readonly PackageCalendarEntry[]) =>
  calendar.filter(e => e.serviceKey === key && e.kind !== "recurring" && e.inStandard).length;
const RECURRING = new Set(["mowing", "winter_visits", "irrigation_inspection"]);
const SNOW = new Set(["snow_walks", "snow_drives", "ice_melt", "snow_stakes"]);
export const standardScopeIncludes = (key: string, line: string, calendar: readonly PackageCalendarEntry[] = [], catalog: readonly ScopeDefault[] = []) =>
  line === "snow" ? SNOW.has(key) : RECURRING.has(key) || inStandardPackage(catalog.find(c => c.key === key) ?? { key }, calendar);
export function initialScope(line: "landscape" | "snow" | "both", catalog: readonly ScopeDefault[], calendar: readonly PackageCalendarEntry[] = []) {
  return catalog.filter(c => line === "both" || (line === "snow" ? c.line === "snow" : c.line !== "snow")).map(c => ({
    serviceKey: c.key, label: c.label, line: c.line, wordModule: c.wordModule, existed: false,
    included: standardScopeIncludes(c.key, c.line, calendar, catalog),
    quantity: ["campaign", "checklist"].includes(c.scheduling ?? "") ? null : c.defaultQuantity, unit: c.unit,
    monthSpread: ["campaign", "checklist"].includes(c.scheduling ?? "") ? null : c.defaultMonthSpread ? [...c.defaultMonthSpread] : null,
    details: {} as Record<string, unknown>, priceCents: null as number | null, notes: null as string | null,
  }));
}
