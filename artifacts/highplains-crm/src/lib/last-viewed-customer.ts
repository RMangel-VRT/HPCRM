/** IDs only, bounded and tenant-scoped. Never migrate the old unscoped key. */
const key = (companyId: string) => `recentCustomerIds:${companyId}`;
export function getRecentCustomerIds(companyId: string | null | undefined): string[] {
  if (!companyId) return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key(companyId)) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && !!v))].slice(0, 5) : [];
  } catch { return []; }
}
export function recordRecentCustomer(companyId: string | null | undefined, id: string) {
  if (!companyId || !id) return;
  try { window.localStorage.setItem(key(companyId), JSON.stringify([id, ...getRecentCustomerIds(companyId).filter(v => v !== id)].slice(0, 5))); }
  catch { /* Browsing must still work when storage is unavailable. */ }
}
export function removeRecentCustomer(companyId: string | null | undefined, id: string) {
  if (!companyId) return;
  try { window.localStorage.setItem(key(companyId), JSON.stringify(getRecentCustomerIds(companyId).filter(v => v !== id))); }
  catch { /* Optional local history. */ }
}
