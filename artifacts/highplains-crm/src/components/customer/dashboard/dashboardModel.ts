import type { ContractSummaryTerm } from "@/hooks/useCustomerContractSummary";
import type { CustomerService } from "@/hooks/useCustomerServices";
import { isOpenTicket } from "@/components/customer/customerBadges";
import { companyToday } from "@/lib/schedulingStatus";

export function customerInitials(name: string): string {
  return name.trim().split(/\s+/).filter(w => !/^\d+$/.test(w) && !/^(at|the|of|and)$/i.test(w))
    .slice(0, 2).map(w => Array.from(w)[0]?.toLocaleUpperCase() ?? "").join("");
}

/** Never allocate inherited commercial amounts to a branch, or convert unknown/T&M to zero. */
export function aggregateTerms(terms: ContractSummaryTerm[]) {
  const unique = [...new Map(terms.map((t, i) => [t.termId ?? `row:${i}`, t])).values()];
  const own = unique.filter(t => !t.parentCustomerId);
  const priced = own.filter(t => t.annualCents != null);
  const monthMaps = priced.map(t => {
    const months = new Map<string, number>();
    for (const m of t.billingMonths ?? []) months.set(m.month, (months.get(m.month) ?? 0) + m.amountCents);
    return months;
  });
  // A single monthly figure is honest only for uniform, aligned payment schedules.
  const keys = [...(monthMaps[0]?.keys() ?? [])].sort();
  const aligned = keys.length > 0 && monthMaps.every(m => [...m.keys()].sort().join() === keys.join());
  const sums = aligned ? keys.map(k => monthMaps.reduce((n, m) => n + m.get(k)!, 0)) : [];
  const hasUnpriced = own.some(t => t.annualCents == null && t.snowPricing !== "time_and_materials");
  const hasInherited = unique.some(t => !!t.parentCustomerId);
  return {
    annualCents: priced.length ? priced.reduce((n, t) => n + t.annualCents!, 0) : null,
    labels: [...new Set(unique.map(t => t.label))],
    lines: (["landscape", "snow"] as const).filter(line => unique.some(t => t.line === line || t.line === "both")),
    hasSnowTm: unique.some(t => t.snowPricing === "time_and_materials"),
    hasUnpriced, hasInherited,
    monthlyCents: !hasUnpriced && !hasInherited && sums.length > 0 && sums.every(n => n === sums[0]) ? sums[0]! : null,
  };
}

const dayNumber = (ymd: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return NaN;
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d));
  return date.toISOString().slice(0, 10) === ymd ? date.getTime() / 86400000 : NaN;
};
/** Colorado calendar age, not elapsed 24h; date-only inputs remain calendar values. */
export function calendarAge(instant: string | Date | null | undefined, today = companyToday()): number | null {
  if (!instant) return null;
  let ymd: string;
  if (typeof instant === "string" && /^\d{4}-\d{2}-\d{2}$/.test(instant)) ymd = instant;
  else {
    const date = new Date(instant);
    if (!Number.isFinite(date.getTime())) return null;
    ymd = companyToday(date);
  }
  const difference = dayNumber(today) - dayNumber(ymd);
  return Number.isFinite(difference) ? difference : null;
}

type AttentionTicket = { createdAt?: string | Date | null; currentStatusId?: string | null; completedAt?: unknown };
export interface AttentionInput {
  customerId: string; today: string; services?: CustomerService[]; tickets?: AttentionTicket[];
  statuses?: { id: string; isFinal?: string | boolean | null }[];
  proposals?: { status?: string | null }[]; missingSetupCount?: number; snowFlagCount?: number;
  managerName?: string | null; qboAttention?: boolean;
  terms?: (ContractSummaryTerm & { renewalDue?: boolean })[];
  isParent?: boolean; branchOpenTickets?: number; uncoveredBranches?: number;
}
export interface AttentionItem {
  key: string; labelKey: string; values: Record<string, string | number>; tab?: string; href?: string;
}
export function evaluateAttention(input: AttentionInput): AttentionItem[] {
  const result: AttentionItem[] = [];
  const add = (key: string, tab: string, values: AttentionItem["values"] = {}) =>
    result.push({ key, labelKey: `cp3.attention.${key}`, values, tab });
  if (input.isParent) {
    if (input.branchOpenTickets) add("branchTickets", "tickets", { count: input.branchOpenTickets });
    if (input.uncoveredBranches) add("uncovered", "branches", { count: input.uncoveredBranches });
  } else {
    const overdue = input.services?.filter(s => s.state === "overdue").length ?? 0;
    if (overdue) add("overdue", "services", { count: overdue });
    if (input.snowFlagCount) add("snow", "snow", { manager: input.managerName || "" });
    const old = input.tickets?.filter(t => isOpenTicket(t, input.statuses) && (calendarAge(t.createdAt, input.today) ?? 0) > 30).length ?? 0;
    if (old) add("oldTickets", "tickets", { count: old });
    const drafts = input.proposals?.filter(p => p.status === "draft").length ?? 0;
    if (drafts) add("drafts", "proposals", { count: drafts });
    if (input.missingSetupCount) result.push({ key: "setup", labelKey: "cp3.attention.setup", values: { count: input.missingSetupCount },
      href: `/dashboard/customers/${input.customerId}/edit` });
  }
  if (input.qboAttention) add("qbo", "billing");
  // The server projects Contract Center's actual renewal rule (including successors
  // and non-renewal). Do not recreate that policy using an end-date alone.
  const endings = input.terms?.filter(t => t.renewalDue === true)
    .map(t => -(calendarAge(t.endDate, input.today) ?? -Infinity)).filter(n => n >= 0 && n <= 60) ?? [];
  if (endings.length) add("ending", "contracts", { days: Math.min(...endings) });
  return result;
}

export function serviceDashboardRows(services: CustomerService[]) {
  const pending = services.filter(s => ["overdue", "in_window", "upcoming"].includes(s.state));
  const rank = { overdue: 0, in_window: 1, upcoming: 2, done: 3, skipped: 4 };
  pending.sort((a, b) => rank[a.state] - rank[b.state] || a.end.localeCompare(b.end) || a.id.localeCompare(b.id));
  const done = services.filter(s => s.state === "done").sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? "") || a.id.localeCompare(b.id));
  return { rows: [...pending, ...done.slice(0, 3)], remainingCompleted: Math.max(0, done.length - 3),
    done: done.length, total: services.length,
    overdue: pending.filter(s => s.state === "overdue").length, inWindow: pending.filter(s => s.state === "in_window").length };
}
