import { CONTRACT_STATES, contractNeedsAction, contractSegment, emptyContractCounts } from "../../../../../lib/db/src/contractAttention";
import type { ContractState, ContractSegment } from "../../../../../lib/db/src/contractAttention";
import type { BoardLine, ContractListItem, TermSummary } from "./contractTypes";
import { addDays, coloradoDay, dateOnly } from "./contractFormat";

export { CONTRACT_STATES, contractNeedsAction, contractSegment, emptyContractCounts };
export type { ContractState, ContractSegment };

export interface LineAttention { total: number; counts: Record<ContractState, number>; actionNeeded: number }
export interface AttentionResponse {
  total: number;
  counts: Record<ContractState, number>;
  flagged: { missing_document: number; active_no_contract: number };
  lines: Record<BoardLine, LineAttention>;
  items: Record<ContractState, ContractListItem[]>;
}
export const ATTENTION_KEY = "/api/contract-center/attention";
export const isAttention = (v: unknown): v is AttentionResponse =>
  !!v && typeof v === "object" && !Array.isArray(v) && "lines" in v && "counts" in v;

/** Status-bar order and colors, taken from the With CC-ATTN reference. */
export const SEGMENTS: { key: ContractSegment; color: string }[] = [
  { key: "decision", color: "var(--ts-lost)" },
  { key: "due", color: "var(--ts-waiting)" },
  { key: "drafted", color: "var(--ts-active)" },
  { key: "good", color: "var(--ts-done)" },
  { key: "notrenewing", color: "var(--ts-open)" },
  { key: "closed", color: "color-mix(in srgb, var(--ts-open) 45%, transparent)" },
];
export const segmentColor = (s: ContractSegment) => SEGMENTS.find(x => x.key === s)!.color;
export const STATE_TONE: Record<ContractState, string> = {
  ended_no_decision: "var(--ts-lost)", working_unsigned: "var(--ts-lost)", unclassified: "var(--ts-lost)",
  renewal_due: "var(--ts-waiting)", renewal_in_progress: "var(--ts-active)", new_draft: "var(--ts-active)",
  good: "var(--ts-done)", serving_not_renewing: "var(--ts-open)", closed: "var(--ts-open)", closed_recently: "var(--ts-open)",
};

/** A missing or unknown server state is surfaced as unclassified; it never disappears. */
export const itemState = (i: { state?: string | null }): ContractState =>
  (CONTRACT_STATES as readonly string[]).includes(i.state ?? "") ? i.state as ContractState : "unclassified";
export const itemSegment = (i: { state?: string | null }) => contractSegment(itemState(i));
/** Line membership for totals, table and board: the server's applicableLines; older payloads fall back to item.line. */
export function onLine(i: Pick<ContractListItem, "applicableLines" | "line">, board: BoardLine): boolean {
  if (Array.isArray(i.applicableLines)) return i.applicableLines.includes(board);
  return i.line === "both" || i.line === board || !["landscape", "snow"].includes(i.line);
}
export const hasMissingDoc = (i: { flags?: string[] }) => !!i.flags?.includes("missing_document");

/** Account for items locally (used only while the attention endpoint is unavailable). */
export function localLineCounts(items: ContractListItem[], board: BoardLine): LineAttention {
  const counts = emptyContractCounts();
  let total = 0, actionNeeded = 0;
  for (const i of items) {
    if (!onLine(i, board)) continue;
    const s = itemState(i);
    counts[s]++; total++;
    if (contractNeedsAction(s)) actionNeeded++;
  }
  return { total, counts, actionNeeded };
}
export function segmentCounts(counts: Partial<Record<ContractState, number>>): Record<ContractSegment, number> {
  const out: Record<ContractSegment, number> = { decision: 0, due: 0, drafted: 0, good: 0, notrenewing: 0, closed: 0 };
  for (const s of CONTRACT_STATES) out[contractSegment(s)] += counts[s] ?? 0;
  return out;
}

/** The season that explains the state: the server's stateTermId when present, else the best available. */
export function stateTerm(item: ContractListItem): TermSummary | null {
  if (item.stateTerm) return item.stateTerm;
  const all = [item.current, item.renewalDraft, item.latest, item.recentSigned, item.renewalSource].filter(Boolean) as TermSummary[];
  return (item.stateTermId && all.find(t => t.id === item.stateTermId)) || item.current || item.renewalDraft || item.latest || null;
}

export const signedRecently = (item: ContractListItem, today: string) => {
  const at = item.recentSigned?.signedAt;
  if (!at) return false;
  const day = coloradoDay(at);
  return day >= addDays(today, -60) && day <= today;
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);

type T = (key: string, opts?: Record<string, unknown>) => string;
/** One-line reason for a state, built from server facts and translated. */
export function stateReasonText(t: T, state: ContractState, term: { seasonLabel?: string; status?: string; endDate?: string } | null,
  since: string | null | undefined, today: string, serverReason?: string | null): string {
  const date = dateOnly(since ?? term?.endDate);
  const season = term?.seasonLabel ?? "";
  switch (state) {
    case "ended_no_decision": return t("contractAttention.reason.ended", { date });
    case "working_unsigned": return t("contractAttention.reason.unsigned", { season, status: t(`contractAttention.termStatus.${term?.status ?? "draft"}`, { defaultValue: term?.status ?? "" }) });
    case "unclassified": {
      // The server names the specific unsupported cause; keep it beside the localized headline.
      const base = t("contractAttention.reason.unclassified");
      return serverReason && serverReason !== "unclassified" ? `${base} ${serverReason}` : base;
    }
    case "renewal_due": {
      const end = term?.endDate ?? since;
      return end ? t("contractAttention.reason.due", { count: Math.max(0, daysBetween(today, end)) }) : t("contractAttention.state.renewal_due");
    }
    case "renewal_in_progress": return t("contractAttention.reason.inProgress", { season, status: t(`contractAttention.termStatus.${term?.status ?? "draft"}`, { defaultValue: term?.status ?? "" }) });
    case "new_draft": return t("contractAttention.reason.newDraft");
    case "good": return t("contractAttention.reason.good");
    case "serving_not_renewing": return t("contractAttention.reason.notRenewing", { date: dateOnly(term?.endDate ?? since) });
    case "closed": case "closed_recently": return t("contractAttention.reason.closed", { date });
    default: { const never: never = state; return serverReason ?? String(never); }
  }
}
