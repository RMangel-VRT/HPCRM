import type { AgreementTerm } from "@workspace/db";
import { isCalendarDate } from "@workspace/db/estimate-contracts";
import { RENEWAL_WINDOW_DAYS, type ContractProjection, type ContractState } from "@workspace/db/contract-attention";
import { addCalendarDays } from "./companyDay";

export { RENEWAL_WINDOW_DAYS };
type Season = Pick<AgreementTerm, "id" | "status" | "startDate" | "endDate" | "renewedFromTermId"> &
  { nonRenewalOn?: string | null; seasonLabel?: string };
export const signedSeason = (t: Season) => ["signed", "active", "renewed"].includes(t.status);
const priority = (a: Season, b: Season) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id);
const covers = (t: Season, today: string) => t.startDate <= today && today <= t.endDate;
export function unclassifiedContract(reason = "Couldn't classify — open and check"): ContractProjection {
  return { state: "unclassified", stateSince: null, stateReason: reason, stateTermId: null,
    flags: [], allowedActions: ["open"], actionTermId: null };
}
/** Total, deterministic projection; ignores cancelled successors and never mutates history.
 * Final-source explicit decisions precede unsigned work. Pending work covering today
 * precedes new_draft, including never-signed agreements (owner clarification).
 */
export function contractState(input: readonly Season[], today: string): ContractProjection {
  const terms = input.filter(t => t.status !== "cancelled");
  if (typeof today !== "string" || !isCalendarDate(today) || terms.some(t => !t.id ||
    typeof t.startDate !== "string" || typeof t.endDate !== "string" || !isCalendarDate(t.startDate) ||
    !isCalendarDate(t.endDate) || t.startDate > t.endDate ||
    !["draft", "sent", "signed", "active", "renewed", "lost"].includes(t.status)))
    return unclassifiedContract();
  const signed = terms.filter(signedSeason).sort(priority), final = signed[0];
  const finalSource = terms.filter(t => !(t.renewedFromTermId && ["draft", "sent", "lost"].includes(t.status))).sort(priority)[0];
  const pending = terms.filter(t => ["draft", "sent"].includes(t.status)).sort(priority);
  const current = signed.filter(t => covers(t, today))[0];
  const unsigned = pending.filter(t => covers(t, today))[0];
  // A lost renewal is an explicit decision on its source. A cancelled one is not.
  const finalLoss = final && terms.filter(t => t.renewedFromTermId === final.id && t.status === "lost").sort(priority)[0];
  const make = (state: ContractState, term: Season | undefined, since: string | null, reason: string): ContractProjection =>
    ({ state, stateTermId: term?.id ?? null, stateSince: since, stateReason: reason,
      flags: [], allowedActions: ["open"], actionTermId: term?.id ?? null });
  const close = (term?: Season) => make(term && term.endDate < today &&
    term.endDate >= addCalendarDays(today, -RENEWAL_WINDOW_DAYS) ? "closed_recently" : "closed",
    term, term?.endDate ?? null, term ? `Closed after ${term.endDate}` : "No signed or pending seasons");
  if (!signed.length && !pending.length) return close([...terms].sort(priority)[0]);
  if (finalSource?.status === "lost" && (!final || finalSource.startDate >= final.startDate)) return close(finalSource);
  if (final && (final.nonRenewalOn || finalLoss)) {
    if (final.endDate < today) return close(final);
    return make("serving_not_renewing", current ?? final, final.nonRenewalOn ?? finalLoss!.startDate,
      `Not renewing after ${final.endDate}`);
  }
  if (!current && unsigned) return make("working_unsigned", unsigned, unsigned.startDate,
    `Working on ${unsigned.seasonLabel ?? "season"} ${unsigned.status} since ${unsigned.startDate}, not signed`);
  if (!signed.length && pending.length) return make("new_draft", pending[0], pending[0].startDate, "New contract, never signed");
  if (current) {
    const laterSigned = signed.some(t => t.startDate > current.startDate);
    if (laterSigned || addCalendarDays(current.endDate, -RENEWAL_WINDOW_DAYS) > today)
      return make("good", current, current.startDate, laterSigned ? "Signed successor recorded" : "Signed season in effect");
    const renewal = pending.find(t => t.startDate > current.startDate);
    if (renewal) return make("renewal_in_progress", renewal, renewal.startDate, `Renewal ${renewal.status} for ${renewal.seasonLabel ?? renewal.startDate}`);
    return make("renewal_due", current, addCalendarDays(current.endDate, -RENEWAL_WINDOW_DAYS),
      `Ends ${current.endDate}, within ${RENEWAL_WINDOW_DAYS} days`);
  }
  if (signed.some(t => t.startDate > today)) {
    const future = [...signed].filter(t => t.startDate > today).reverse()[0];
    return make("good", future, future.startDate, `Signed season starts ${future.startDate}`);
  }
  if (final?.endDate && final.endDate < today) {
    const renewal = pending.find(t => t.startDate > final.startDate);
    if (renewal) return make("renewal_in_progress", renewal, renewal.startDate, `Renewal ${renewal.status} for ${renewal.seasonLabel ?? renewal.startDate}`);
    return make("ended_no_decision", final, final.endDate, `Ended ${final.endDate}, no renewal or loss recorded`);
  }
  return unclassifiedContract();
}

/** Same classifier owns progress eligibility, including resolved sources that no
 * longer appear as action work. Each agreement contributes at most once. */
export function contractRenewalProgress(terms: readonly Season[], today: string) {
  const projection = contractState(terms, today);
  if (projection.state === "unclassified") return { due: false, signed: false, notRenewing: false };
  const dueSources = terms.filter(t => signedSeason(t) && t.endDate >= addCalendarDays(today, -RENEWAL_WINDOW_DAYS) &&
    addCalendarDays(t.endDate, -RENEWAL_WINDOW_DAYS) <= today);
  return { due: dueSources.length > 0, notRenewing: dueSources.some(t => !!t.nonRenewalOn),
    signed: dueSources.some(source => terms.some(t => t.renewedFromTermId === source.id && signedSeason(t))) };
}
