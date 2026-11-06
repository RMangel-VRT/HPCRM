import type { QuickBooksCard } from "@/lib/qboReview";

/** Pending = not final. accepted, rejected and finalized are final. */
export const FINAL_PROPOSAL_STATUSES = ["accepted", "rejected", "finalized"] as const;
export const pendingProposalCount = (proposals: { status?: string | null }[]) =>
  proposals.filter(p => !(FINAL_PROPOSAL_STATUSES as readonly string[]).includes(p.status ?? "")).length;

type TicketLike = { completedAt?: unknown; currentStatusId?: string | null };
type StatusLike = { id: string; isFinal?: string | boolean | null };
const finalFlag = (v: unknown) => v === true || v === "true";
/**
 * The customer tickets endpoint returns plain ticket rows (currentStatusId, no joined status).
 * Open = the ticket's current status is not final per the company's ticket statuses.
 * Only when the status list isn't loaded or the status is unknown does it fall back to completedAt.
 */
export const isOpenTicket = (t: TicketLike, statuses?: StatusLike[] | null) => {
  const st = t.currentStatusId && statuses ? statuses.find(s => s.id === t.currentStatusId) : undefined;
  if (st && st.isFinal !== undefined && st.isFinal !== null) return !finalFlag(st.isFinal);
  return !t.completedAt;
};
export const openTicketCount = (tickets: TicketLike[], statuses?: StatusLike[] | null) =>
  tickets.filter(t => isOpenTicket(t, statuses)).length;

/** Matches what the QuickBooks card flags: sync error, name clash, any other open review, or incomplete bill-to. */
export function qboNeedsAttention(card: QuickBooksCard | undefined | null, state: string | null) {
  if (!card) return false;
  if (state === "error" || state === "collision") return true;
  if ((card.reviews ?? []).length > 0) return true;
  return !!card.billTo && "problem" in card.billTo;
}
