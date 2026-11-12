import type { CustomerContractInputs } from "./customerContractSummary";
import { coverageResolver } from "./contractCoverage";
import { CAMPAIGN_TERM_STATUSES } from "../../../../lib/db/src/serviceCalendarContracts";
import { compareTermPriority } from "./contractCenterService";

/** Inclusive twelve-calendar-month continuation, clamped for leap-day ends. */
export function renewalDemandThrough(end: string) {
  const d = new Date(`${end}T00:00:00Z`);
  const year = d.getUTCFullYear() + 1, month = d.getUTCMonth();
  const day = Math.min(d.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Campaign-only continuation. Shared coverageResolver and Routes stay unchanged. */
export function campaignDemandCoverage(inputs: CustomerContractInputs, propertyId: string, serviceKey: string, date: string) {
  const property = inputs.customers.find(c => c.id === propertyId);
  if (!property) return null;
  const data = {
    customers: inputs.customers.filter(c => c.companyId === property.companyId),
    agreements: inputs.agreements.filter(a => a.companyId === property.companyId),
    terms: inputs.terms.filter(t => t.companyId === property.companyId),
    scopes: (inputs.scope ?? []).filter(s => s.companyId === property.companyId),
  };
  const current = coverageResolver(data, { statuses: CAMPAIGN_TERM_STATUSES }).forDate(propertyId, serviceKey, date);
  if (current) return { ...current, renewalPending: false, blocked: null };
  const prior = (owner: string | null) => {
    const ids = new Set(data.agreements.filter(a => a.customerId === owner).map(a => a.id));
    return data.terms.filter(t => ids.has(t.agreementId) && (t.line === "landscape" || t.line === "both") &&
      CAMPAIGN_TERM_STATUSES.includes(t.status as typeof CAMPAIGN_TERM_STATUSES[number]) && t.endDate < date)
      .sort((a, b) => b.endDate.localeCompare(a.endDate) ||
        Number(a.status === "sent") - Number(b.status === "sent") || compareTermPriority(a, b))[0];
  };
  // Select latest first; a refusal must never revive an older season or parent.
  const term = prior(propertyId) ?? prior(property.parentCustomerId);
  if (!term) return null;
  const lines = data.scopes.filter(s => s.termId === term.id && s.serviceKey === serviceKey);
  const blocked = term.nonRenewalOn ? "not_renewing" as const :
    date > renewalDemandThrough(term.endDate) ? "renewal_beyond_12_months" as const : null;
  return { term, lines, scope: lines.find(s => s.included) ?? null, renewalPending: !blocked, blocked };
}
