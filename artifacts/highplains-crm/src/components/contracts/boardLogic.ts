import { termForm, termLine } from "./contractTypes";
import type { BoardLine, ContractListItem, TermSummary } from "./contractTypes";
import { hasMissingDoc, itemSegment, itemState, onLine, signedRecently, stateTerm } from "./contractAttention";
import type { ContractSegment } from "./contractAttention";

/** Membership on a line comes from the server's applicableLines (shared with the accounting totals). */
export const onBoard = (item: ContractListItem, board: BoardLine) => onLine(item, board);
export const rowLine = (item: ContractListItem) => termLine(rowTerm(item), item.line);
export const rowForm = (item: ContractListItem) => termForm(rowTerm(item), item.form);

export const matchesSearch = (item: ContractListItem, q: string) =>
  !q.trim() || item.customerName.toLowerCase().includes(q.trim().toLowerCase());

/** The pipeline holds only action work; Signed and Lost columns are retired. */
export type ColumnKey = "decision" | "renewal" | "drafted";
export const COLUMN_SEGMENT: Record<ColumnKey, ContractSegment> = { decision: "decision", renewal: "due", drafted: "drafted" };
/** term is null for malformed agreements without a representative season; they still render and open. */
export interface BoardCard { item: ContractListItem; term: TermSummary | null; column: ColumnKey }

/** Exactly one placement per action agreement, read from the server state. */
export function placements(item: ContractListItem): BoardCard[] {
  const seg = itemSegment(item);
  const column: ColumnKey | null = seg === "decision" ? "decision" : seg === "due" ? "renewal" : seg === "drafted" ? "drafted" : null;
  return column ? [{ item, term: stateTerm(item), column }] : [];
}

const endOf = (c: BoardCard) => c.item.stateSince ?? c.term?.endDate ?? "";
export function boardColumns(items: ContractListItem[], board: BoardLine, q: string): Record<ColumnKey, BoardCard[]> {
  const cols: Record<ColumnKey, BoardCard[]> = { decision: [], renewal: [], drafted: [] };
  for (const item of items) {
    if (!matchesSearch(item, q) || !onBoard(item, board)) continue;
    for (const card of placements(item)) cols[card.column].push(card);
  }
  const critical = (c: BoardCard) => (itemState(c.item) === "unclassified" ? 0 : 1);
  cols.decision.sort((a, b) => critical(a) - critical(b) || endOf(a).localeCompare(endOf(b)));
  cols.renewal.sort((a, b) => (a.term?.endDate ?? "").localeCompare(b.term?.endDate ?? ""));
  cols.drafted.sort((a, b) => endOf(a).localeCompare(endOf(b)));
  return cols;
}

export function renewalProgress(items: ContractListItem[], board: BoardLine, q: string) {
  let due = 0, signed = 0, notRenewing = 0;
  for (const item of items) {
    if (!onBoard(item, board) || !matchesSearch(item, q) || !item.renewalProgress?.due) continue;
    due++;
    if (item.renewalProgress.signed) signed++;
    if (item.renewalProgress.notRenewing) notRenewing++;
  }
  return { due, signed, notRenewing };
}

export type SortKey = "customer" | "type" | "form" | "season" | "status" | "price" | "agent" | "ends";
export type FilterChip = "review" | "renewal" | "expired" | "lost" | "signed" | "nodoc";

export const rowTerm = (item: ContractListItem) => item.current ?? item.latest ?? item.renewalDraft ?? null;

export function priceLabel(item: Pick<ContractListItem, "line">, term: TermSummary, money: (c: number | null | undefined) => string, board?: BoardLine): string {
  const flat = term.snowPricing === "flat_rate" && term.snowFlatPriceCents != null;
  if (termLine(term, item.line) === "snow" || board === "snow") return flat ? `Flat snow ${money(term.snowFlatPriceCents)}` : "T&M";
  return term.annualPriceCents != null ? money(term.annualPriceCents) : "T&M";
}

const sortValue = (item: ContractListItem, key: SortKey, board: BoardLine): string | number => {
  const t = rowTerm(item);
  switch (key) {
    case "customer": return item.customerName.toLowerCase();
    case "type": return rowLine(item);
    case "form": return rowForm(item);
    case "season": return t?.seasonLabel ?? "";
    case "status": return t?.displayStatus ?? "";
    case "price": return rowLine(item) === "snow" || board === "snow"
      ? (t?.snowPricing === "flat_rate" ? t.snowFlatPriceCents ?? -1 : -1)
      : t?.annualPriceCents ?? -1;
    case "agent": return (t?.managingAgentName ?? "").toLowerCase();
    case "ends": return t?.endDate ?? "";
  }
};

export function matchesChip(i: ContractListItem, chip: FilterChip, today: string): boolean {
  const t = rowTerm(i);
  switch (chip) {
    case "review": return !!t?.needsReview;
    case "renewal": return itemState(i) === "renewal_due";
    case "expired": return t?.displayStatus === "expired";
    case "lost": return t?.displayStatus === "lost" ||
      (["closed", "closed_recently"].includes(itemState(i)) && i.latest?.status === "lost") ||
      (!!i.notRenewing && i.renewalSource?.displayStatus === "lost");
    case "signed": return signedRecently(i, today);
    case "nodoc": return hasMissingDoc(i);
  }
}

/** Chips use OR semantics; a selected segment narrows to exactly the accounting membership. */
export function tableRows(items: ContractListItem[], board: BoardLine, q: string, chips: FilterChip[], key: SortKey, dir: "asc" | "desc",
  opts: { segment?: ContractSegment | null; today?: string } = {}) {
  const today = opts.today ?? items.find(i => i.companyDay)?.companyDay ?? new Date().toISOString().slice(0, 10);
  const rows = items.filter(i => onBoard(i, board) && matchesSearch(i, q))
    .filter(i => !opts.segment || itemSegment(i) === opts.segment)
    .filter(i => !chips.length || chips.some(c => matchesChip(i, c, today)));
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key, board), y = sortValue(b, key, board);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c * sign || a.customerName.localeCompare(b.customerName);
  });
}
