import type { ContractSummaryTerm } from "@/hooks/useCustomerContractSummary";
import type { QboStateKind } from "@/components/customer/header/CustomerHeader";
import { aggregateTerms } from "@/components/customer/dashboard/dashboardModel";
import { formatCurrency } from "@/lib/currency";

export type ListSummary = {
  current: ContractSummaryTerm[];
  season: { annualCents: number | null; hasSnowTm: boolean; hasTerm: boolean };
  branchCount: number; management: string | null; managerSearch: string; qboState: QboStateKind | null; openTickets: number;
};
export const LIST_SUMMARY_API = "/api/customers/list-summary";
export const MAX_SUMMARY_IDS = 200;
export const TOP_LEVEL_PAGE_SIZE = 50;

/** Rows per page of the flattened (top-level + expanded branch) list; always within the endpoint cap. */
export const ROWS_PER_PAGE = TOP_LEVEL_PAGE_SIZE;
/** Paginate the already-flattened display rows; every rendered row is in exactly one page. */
export function paginateRows<T>(rows: readonly T[], page: number, size = ROWS_PER_PAGE): { rows: T[]; pageCount: number; page: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pageCount);
  return { rows: rows.slice((p - 1) * size, p * size), pageCount, page: p };
}
/** The single batch for a page: exactly the rendered row ids (deduped, sorted). Never truncates silently. */
export function summaryIdsForPage(renderedIds: readonly string[]): string[] {
  const ids = [...new Set(renderedIds)].sort();
  if (ids.length > MAX_SUMMARY_IDS) throw new Error(`list-summary batch exceeds ${MAX_SUMMARY_IDS} ids`);
  return ids;
}

/** This season cell, same aggregation as the CP3 header chip. */
export function seasonText(summary: ListSummary | undefined, t: (k: string) => string, locale = "en"): string {
  if (!summary || !summary.current?.length) return "\u2014";
  const agg = aggregateTerms(summary.current);
  if (agg.annualCents != null) return formatCurrency(agg.annualCents, true, locale) + (agg.hasSnowTm ? ` ${t("cp3.chips.snowTm")}` : "");
  if (agg.hasSnowTm) return t("cp1.timeAndMaterials");
  if (agg.hasInherited) return t("cp3.chips.parentPriced");
  return t("cp3.chips.priceNotSet");
}
