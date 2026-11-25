import type { Agreement, AgreementTerm } from "@workspace/db";
import { selectRenewalSource } from "./contractCenterService";
import { nextSeasonConflict } from "../../../../lib/db/src/contractNextSeason";

const qualifying = (terms: AgreementTerm[]) => terms.filter(t => !["cancelled", "lost"].includes(t.status))
  .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));

/** Shared read hint and locked write validation. Line differences are intentional. */
export function separateMergePlan(target: Agreement, targetTerms: AgreementTerm[], source: Agreement, sourceTerms: AgreementTerm[]) {
  const predecessor = selectRenewalSource(targetTerms), first = qualifying(sourceTerms)[0];
  let blockedReason: string | null = null;
  if (source.id === target.id) blockedReason = "Choose a separate contract to merge.";
  else if (source.importRef !== null) blockedReason = "This contract came from the contract audit import and can't be merged away. Merge in the other direction or contact support.";
  else {
    const conflict = nextSeasonConflict(predecessor, targetTerms, qualifying(sourceTerms));
    if (conflict) blockedReason = conflict.message;
    else if (!first) blockedReason = "The separate contract has no season to merge as a renewal.";
    else if (first.renewedFromTermId !== null) blockedReason = `${first.seasonLabel} is already a renewal of another season.`;
  }
  return { predecessor, first, blockedReason };
}

export function separateMergeCandidates(target: Agreement, terms: AgreementTerm[], customerAgreements: Agreement[], customerTerms: AgreementTerm[]) {
  const predecessor = selectRenewalSource(terms);
  if (!predecessor) return [];
  const grouped = new Map<string, AgreementTerm[]>();
  for (const term of customerTerms) {
    const group = grouped.get(term.agreementId) ?? [];
    group.push(term); grouped.set(term.agreementId, group);
  }
  return customerAgreements.filter(a => a.id !== target.id && a.companyId === target.companyId && a.customerId === target.customerId)
    .flatMap(source => {
      const seasons = grouped.get(source.id) ?? [], plan = separateMergePlan(target, terms, source, seasons);
      if (!plan.first || plan.first.startDate <= predecessor.startDate) return [];
      return [{ agreementId: source.id, firstSeasonLabel: plan.first.seasonLabel, firstStartDate: plan.first.startDate,
        propertyManagementCompanyId: source.propertyManagementCompanyId,
        blockedReason: plan.blockedReason, seasons: [...seasons].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
          .map(t => ({ id: t.id, seasonLabel: t.seasonLabel, startDate: t.startDate, endDate: t.endDate,
            status: t.status, line: t.line, annualPriceCents: t.annualPriceCents })) }];
    }).sort((a, b) => a.firstStartDate.localeCompare(b.firstStartDate) || a.agreementId.localeCompare(b.agreementId));
}
