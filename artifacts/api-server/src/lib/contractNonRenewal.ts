import { and, eq } from "drizzle-orm";
import { customers } from "@workspace/db";
import { NON_RENEWAL_LABELS, isNotRenewing } from "../shared/contractCatalog";
import { ContractCenterError, nonRenewalSchema, renewalSet, selectRenewalSource } from "./contractCenterService";
import { agreementSeasons, getTerm, lockTerm, writeTerm, type Transaction } from "./contractCenterPersistence";
import { applyContractStatus } from "./contractCenterStatusChange";
import { lockRfp } from "./rfpContracts";
import type { z } from "zod/v4";

/** Resolve linked pending sets before taking the agreement lock. Lifecycle operations
 * universally take RFP locks first. Recheck the exact locked population afterward. */
async function lockOutcome(tx: Transaction, companyId: string, termId: string) {
  const initial = await getTerm(tx, companyId, termId);
  const before = await agreementSeasons(tx, companyId, initial.agreementId);
  const bidIds = [...new Set(before.map(t => t.bidTicketId).filter((id): id is string => !!id))].sort();
  for (const id of bidIds) await lockRfp(tx, companyId, id);
  const locked = await lockTerm(tx, companyId, termId);
  const terms = await agreementSeasons(tx, companyId, initial.agreementId);
  if (terms.some(t => t.bidTicketId && !bidIds.includes(t.bidTicketId)))
    throw new ContractCenterError(409, "Contract renewals changed; try again");
  return { ...locked, terms };
}
function assertNoSignedSuccessor(termId: string, terms: Awaited<ReturnType<typeof agreementSeasons>>) {
  if (terms.some(t => t.renewedFromTermId === termId && ["signed", "active", "renewed"].includes(t.status)))
    throw new ContractCenterError(409, "A renewal is already signed; non-renewal cannot be changed");
}
export async function recordNonRenewal(tx: Transaction, companyId: string, userId: string, termId: string,
  body: z.infer<typeof nonRenewalSchema>) {
  const { term, terms } = await lockOutcome(tx, companyId, termId);
  const set = renewalSet(terms, terms.find(t => t.id === term.id)!);
  if (set.length > 1 && set[set.length - 1].id !== termId)
    throw new ContractCenterError(409, `Record non-renewal on the last year (${set[set.length - 1].seasonLabel}) of this renewal.`);
  assertNoSignedSuccessor(termId, terms);
  if (selectRenewalSource(terms)?.id !== termId || !["signed", "active", "renewed"].includes(term.status))
    throw new ContractCenterError(409, "Non-renewal must be recorded on the final renewal-source season");
  if (isNotRenewing(term)) return term; // retries do not duplicate attributable history
  const label = NON_RENEWAL_LABELS.en[body.reason];
  const pending = terms.filter(t => t.renewedFromTermId === termId && ["draft", "sent"].includes(t.status));
  for (const draft of pending) {
    await applyContractStatus(tx, { companyId, userId, termId: renewalSet(terms, draft)[0].id,
      to: "lost", note: `Not renewing: ${label}` });
  }
  return writeTerm(tx, companyId, userId, term, { nonRenewalOn: body.decidedOn, nonRenewalReason: body.reason,
    nonRenewalCompetitor: body.competitor || null, nonRenewalNote: body.note || null,
    nonRenewalBy: userId, deactivateCustomerOnEnd: body.deactivateCustomer },
  `Not renewing: ${label} (decided ${body.decidedOn})${body.competitor ? ` — ${body.competitor}` : ""}`, "outcome");
}
export async function undoNonRenewal(tx: Transaction, companyId: string, userId: string, termId: string) {
  const { term, terms, agreement } = await lockOutcome(tx, companyId, termId);
  assertNoSignedSuccessor(termId, terms);
  const [customer] = await tx.select().from(customers).where(and(eq(customers.id, agreement.customerId), eq(customers.companyId, companyId)));
  if (isNotRenewing(term)) await writeTerm(tx, companyId, userId, term, {
    nonRenewalOn: null, nonRenewalReason: null, nonRenewalCompetitor: null,
    nonRenewalNote: null, nonRenewalBy: null, deactivateCustomerOnEnd: false,
  }, "Not renewing undone", "outcome");
  return { customerStillInactive: customer?.status === "inactive" };
}
