export const BILLING_ROLES = ["admin", "office"];
export const canViewBilling = (role?: string | null) => !!role && BILLING_ROLES.includes(role);

export interface PendingInvoice {
  id: string;
  title: string;
  assignedToId?: string | null;
  invoiceCategory?: string | null;
  workCompletedDate?: string | Date | null;
  createdAt?: string | Date | null;
  ageDays?: number | null;
  customer?: { id: string; name?: string | null } | null;
  sourceTicket?: { id: string; title: string; typeKey?: string | null; typeName?: string | null } | null;
  ticketTypeName?: string | null;
}

const propName = (r: PendingInvoice) => r.customer?.name?.trim() || "";
const ts = (r: PendingInvoice) => {
  const v = r.workCompletedDate ?? r.createdAt;
  const n = v ? new Date(v).getTime() : NaN;
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
};

/** Property A-Z, then oldest first. Unnamed properties last. */
export function sortPendingInvoices(rows: PendingInvoice[]): PendingInvoice[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => {
      const pa = propName(a), pb = propName(b);
      if (!pa !== !pb) return pa ? -1 : 1;
      const c = pa.localeCompare(pb, undefined, { sensitivity: "base" });
      return c || ts(a) - ts(b) || a.id.localeCompare(b.id);
    });
}

export function groupByProperty(rows: PendingInvoice[]) {
  const groups = new Map<string, { key: string; name: string; rows: PendingInvoice[] }>();
  for (const r of sortPendingInvoices(rows)) {
    const key = r.customer?.id ?? "none";
    const group = groups.get(key);
    if (group) group.rows.push(r);
    else groups.set(key, { key, name: propName(r) || "No property", rows: [r] });
  }
  return [...groups.values()];
}

const gkey = (uid?: string | null) => `billing.groupByProperty:${uid ?? "anon"}`;
export function readGroupPref(uid?: string | null): boolean {
  try { return window.localStorage.getItem(gkey(uid)) === "true"; } catch { return false; }
}
export function writeGroupPref(uid: string | null | undefined, v: boolean) {
  try { window.localStorage.setItem(gkey(uid), String(v)); } catch { /* ignore */ }
}
