import type { TermStatus } from "@workspace/db";
import { ContractCenterError, assertMove, renewalSet } from "./contractCenterService";
import { getTerm, lockTerm, agreementSeasons, writeTerm, addHistory, type Transaction } from "./contractCenterPersistence";
import { lockRfp, syncRfp } from "./rfpContracts";
import { linkedSeasons } from "./rfpContracts";
import { applyTicketStatus } from "./ticketStatusChange";
import type { Ticket } from "@workspace/db";

/** Caller holds the RFP lock. Close first so ordinary contract status writes
 * cannot recursively advance the ticket while the decision is propagating. */
export async function applyRfpDecisionLost(tx: Transaction, ticket: Ticket, userId: string) {
  await applyTicketStatus(tx, { ticket, toStatusKey: "closed_lost", userId,
    note: "Auto-transitioned: RFP lost, ticket closed as lost" });
  const terms = await linkedSeasons(tx, ticket.companyId, ticket.id);
  for (const term of terms.filter(t => ["draft", "sent"].includes(t.status))
    .sort((a, b) => a.agreementId.localeCompare(b.agreementId) || a.id.localeCompare(b.id))) {
    await applyContractStatus(tx, { companyId: ticket.companyId, userId, termId: term.id, to: "lost",
      note: "RFP Decision recorded as Lost" });
  }
}

/** Ordinary lifecycle operation, shared by the status endpoint and Decision Lost.
 * There is deliberately no propagation-only validation path. */
export async function applyContractStatus(tx: Transaction, input: {
  companyId: string; userId: string; termId: string; to: string; note?: string;
}) {
  const { companyId, userId, termId: id, to, note } = input;
  const initial = await getTerm(tx, companyId, id);
  if (initial.bidTicketId) await lockRfp(tx, companyId, initial.bidTicketId);
  const { term } = await lockTerm(tx, companyId, id);
  const terms = await agreementSeasons(tx, companyId, term.agreementId);
  const set = renewalSet(terms, terms.find(t => t.id === id)!);
  if (set[0].id !== id) throw new ContractCenterError(409,
    `This season is year ${set.findIndex(t => t.id === id) + 1} of a renewal; change its status from ${set[0].seasonLabel}.`);
  const last = set[set.length - 1], now = new Date();
  for (const season of set) {
    assertMove(season.status === "renewed" && set.length > 1 ? { ...season, status: last.status } : season, to);
    const source = season.renewedFromTermId ? await getTerm(tx, companyId, season.renewedFromTermId) : null;
    if (source && source.agreementId !== term.agreementId) throw new ContractCenterError(404, "Renewal source not found");
    await writeTerm(tx, companyId, userId, season, { status: to as TermStatus,
      ...(to === "sent" ? { sentAt: now } : {}), ...(to === "signed" ? { signedAt: now } : {}) }, note ?? `Status changed to ${to}`);
    if (source && to === "signed") await writeTerm(tx, companyId, userId, source, { status: "renewed" }, `Renewed by ${season.seasonLabel}`);
    if (source && season.id === id && to === "lost") await addHistory(tx, companyId, userId, source, "Renewal lost");
  }
  for (const bidId of new Set(set.map(s => s.bidTicketId).filter((id): id is string => !!id)))
    await syncRfp(tx, companyId, bidId, userId, `Contract ${term.seasonLabel} marked ${to} in the Contract Center`);
  return getTerm(tx, companyId, id);
}
