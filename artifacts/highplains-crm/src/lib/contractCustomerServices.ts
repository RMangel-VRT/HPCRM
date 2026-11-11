import type { ServiceFulfillment, ServiceNext } from "@workspace/api-client-react";
import type { DisplayStatus } from "@/components/customer/page/displayStatus";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const SERVICE_STATUS_LABELS: Record<string, string> = {
  on_track: "On track", complete: "Complete", closed_with_skips: "Closed with skips", not_owed: "Not owed",
  overdue: "Overdue", missing_item: "Not on a round yet", waiting_on_signature: "Waiting on signature",
  no_route: "No route set up", no_count: "Contract gives no count", no_timing: "No service timing set",
  invalid_count: "Invalid count", duplicate_lines: "Duplicate lines", count_mismatch: "Count mismatch",
  completed: "Completed", skipped: "Skipped", pending: "Pending",
};
export function serviceStatusLabel(status: string, t?: (key: string, options: any) => unknown): string {
  const fallback = SERVICE_STATUS_LABELS[status] ?? status.replaceAll("_", " ");
  return t ? String(t(`cp6.status.${status}`, { defaultValue: fallback })) : fallback;
}
/** Colors only: never substitute this display tone for the returned primary status. */
export function serviceDisplayStatus(status: string): DisplayStatus {
  if (status === "overdue") return "overdue";
  if (status === "complete" || status === "completed") return "done";
  if (status === "closed_with_skips" || status === "skipped" || status === "not_owed") return "skipped";
  if (status === "on_track") return "active";
  return "pending";
}
const SETUP = new Set(["no_count", "no_timing", "invalid_count", "duplicate_lines", "no_route", "missing_item"]);
export function isServiceSetup(row: ServiceFulfillment) {
  return SETUP.has(row.status) || row.issues.some(issue => SETUP.has(issue));
}
/** Presentation aggregation of supplied values, excluding every unknown denominator. */
export function summarizeContractServices(rows: ServiceFulfillment[]) {
  const known = rows.filter(row => row.owed !== null);
  const nextRows = rows.filter(row => row.next).sort((a, b) => a.next!.date.localeCompare(b.next!.date));
  return {
    rows,
    done: known.reduce((sum, row) => sum + row.done, 0),
    owed: known.reduce((sum, row) => sum + row.owed!, 0),
    knownCount: known.length,
    unknownCount: rows.length - known.length,
    overdue: rows.filter(row => row.status === "overdue").length,
    setup: rows.filter(isServiceSetup).length,
    next: nextRows[0] ?? null,
  };
}
/** Date-only values are calendar days, never UTC instants or invented appointments. */
export function serviceNextLabel(next: ServiceNext, language = "en") {
  const spanish = language.startsWith("es");
  const date = format(new Date(`${next.date.slice(0, 10)}T12:00:00`), next.kind === "route_visit" ? "EEE MMM d" : "MMM d", { locale: spanish ? es : undefined });
  const prefix = next.kind === "round_window" ? (spanish ? "El período abre" : "Window opens")
    : next.kind === "chemical_promise" ? (spanish ? "Prometido" : "Promised") : (spanish ? "Visita" : "Visit");
  return `${prefix} ${date}`;
}
