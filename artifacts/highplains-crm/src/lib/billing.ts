export const BILLING_ROLES = ["admin", "office"];
export interface BillingAccessUser { activeRole?: string | null; activeTags?: string[] | null }
/** Route/API access: admin/office, or an active billing membership tag. */
export const canViewBilling = (user?: BillingAccessUser | null) =>
  !!user && ((!!user.activeRole && BILLING_ROLES.includes(user.activeRole)) || (user.activeTags ?? []).includes("billing"));
/** Tag-only: the person who works the To invoice list. */
export const isBillingPerson = (user?: BillingAccessUser | null) => !!user && (user.activeTags ?? []).includes("billing");
/** Sidebar only (separate from access): admins always; office only when not billing-tagged. */
export const showBillingSidebar = (user?: BillingAccessUser | null) =>
  !!user && (user.activeRole === "admin" || (user.activeRole === "office" && !isBillingPerson(user)));
export const BILLING_LANDING = "/dashboard/tickets/my?tab=invoice";

export type PendingScope = "mine" | "all";
export type PendingView = "waiting" | "recent";
export const pendingInvoicesKey = (companyId: string | null | undefined, userId: string | null | undefined, scope: PendingScope, view: PendingView) =>
  ["/api/pending-invoices", companyId ?? null, userId ?? null, scope, view] as const;

interface TicketLike {
  ticketTypeId?: string | null;
  currentStatusId?: string | null;
  ticketType?: { typeKey?: string | null } | null;
  currentStatus?: { statusKey?: string | null } | null;
}
/** Invoice tickets (any status) and non-Invoice tickets at ready_for_billing; stable keys only. */
export function isBillingItem(
  ticket: TicketLike,
  typeById?: Map<string, { typeKey?: string | null }>,
  statusById?: Map<string, { statusKey?: string | null }>,
): boolean {
  const typeKey = ticket.ticketType?.typeKey ?? (ticket.ticketTypeId ? typeById?.get(ticket.ticketTypeId)?.typeKey : undefined);
  if (typeKey === "invoice") return true;
  const statusKey = ticket.currentStatus?.statusKey ?? (ticket.currentStatusId ? statusById?.get(ticket.currentStatusId)?.statusKey : undefined);
  return statusKey === "ready_for_billing";
}

export interface PendingInvoice {
  id: string;
  kind?: "invoice" | "stranded";
  invoiceNumber?: string | null;
  completedAt?: string | Date | null;
  title: string;
  assignedToId?: string | null;
  assigneeName?: string | null;
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
