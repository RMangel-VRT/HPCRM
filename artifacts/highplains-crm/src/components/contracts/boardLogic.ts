import { addDays, addMonths } from "./contractFormat";
import { coloradoDay } from "./contractFormat";
import type { BoardLine, ContractListItem, TermSummary } from "./contractTypes";

export const onBoard = (item: ContractListItem, board: BoardLine) => item.line === "both" || item.line === board;

export const matchesSearch = (item: ContractListItem, q: string) =>
  !q.trim() || item.customerName.toLowerCase().includes(q.trim().toLowerCase());

export type ColumnKey = "renewal" | "drafted" | "signed" | "lost";
export interface BoardCard { item: ContractListItem; term: TermSummary; column: ColumnKey }

/** Which board columns a contract belongs to (it can appear in more than one, e.g. signed renewal and next draft). */
export function placements(item: ContractListItem, today: string): BoardCard[] {
  const out: BoardCard[] = [];
  const { current, renewalDraft } = item;
  const drafted = !!renewalDraft && ["draft", "sent"].includes(renewalDraft.status);
  if (!drafted && current && (item.renewalDue || current.displayStatus === "expired")) out.push({ item, term: current, column: "renewal" });
  if (drafted && renewalDraft) out.push({ item, term: renewalDraft, column: "drafted" });
  const signed = item.recentSigned;
  if (signed?.signedAt && coloradoDay(signed.signedAt) >= addDays(today, -60)
    && coloradoDay(signed.signedAt) <= today) out.push({ item, term: signed, column: "signed" });
  const latest = item.latest;
  if (latest && latest.status === "lost" && latest.endDate >= addMonths(today, -12)
    && latest.endDate <= today) out.push({ item, term: latest, column: "lost" });
  return out;
}

export function boardColumns(items: ContractListItem[], board: BoardLine, q: string, today: string): Record<ColumnKey, BoardCard[]> {
  const cols: Record<ColumnKey, BoardCard[]> = { renewal: [], drafted: [], signed: [], lost: [] };
  for (const item of items) {
    if (!onBoard(item, board) || !matchesSearch(item, q)) continue;
    for (const card of placements(item, today)) cols[card.column].push(card);
  }
  cols.renewal.sort((a, b) => a.term.endDate.localeCompare(b.term.endDate));
  cols.drafted.sort((a, b) => a.term.endDate.localeCompare(b.term.endDate));
  cols.signed.sort((a, b) => (b.term.signedAt ?? "").localeCompare(a.term.signedAt ?? ""));
  cols.lost.sort((a, b) => b.term.endDate.localeCompare(a.term.endDate));
  return cols;
}

export function renewalProgress(items: ContractListItem[], board: BoardLine, q: string) {
  let due = 0, signed = 0;
  for (const item of items) {
    if (!onBoard(item, board) || !matchesSearch(item, q) || !item.renewalProgress?.due) continue;
    due++;
    if (item.renewalProgress.signed) signed++;
  }
  return { due, signed };
}

export type SortKey = "customer" | "type" | "form" | "season" | "status" | "price" | "agent" | "ends";
export type FilterChip = "review" | "renewal" | "expired";

export const rowTerm = (item: ContractListItem) => item.current ?? item.latest ?? null;

export function priceLabel(item: Pick<ContractListItem, "line">, term: TermSummary, money: (c: number | null | undefined) => string, board?: BoardLine): string {
  const flat = term.snowPricing === "flat_rate" && term.snowFlatPriceCents != null;
  if (item.line === "snow" || board === "snow") return flat ? `Flat snow ${money(term.snowFlatPriceCents)}` : "T&M";
  return term.annualPriceCents != null ? money(term.annualPriceCents) : "T&M";
}

const sortValue = (item: ContractListItem, key: SortKey, board: BoardLine): string | number => {
  const t = rowTerm(item);
  switch (key) {
    case "customer": return item.customerName.toLowerCase();
    case "type": return item.line;
    case "form": return item.form;
    case "season": return t?.seasonLabel ?? "";
    case "status": return t?.displayStatus ?? "";
    case "price": return item.line === "snow" || board === "snow"
      ? (t?.snowPricing === "flat_rate" ? t.snowFlatPriceCents ?? -1 : -1)
      : t?.annualPriceCents ?? -1;
    case "agent": return (t?.managingAgentName ?? "").toLowerCase();
    case "ends": return t?.endDate ?? "";
  }
};

export function tableRows(items: ContractListItem[], board: BoardLine, q: string, chips: FilterChip[], key: SortKey, dir: "asc" | "desc") {
  const rows = items.filter(i => onBoard(i, board) && matchesSearch(i, q)).filter(i => {
    if (!chips.length) return true;
    const t = rowTerm(i);
    return (chips.includes("review") && !!t?.needsReview)
      || (chips.includes("renewal") && i.renewalDue)
      || (chips.includes("expired") && t?.displayStatus === "expired");
  });
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key, board), y = sortValue(b, key, board);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c * sign || a.customerName.localeCompare(b.customerName);
  });
}
