import { eq } from "drizzle-orm";
import {
  customers, agreements, agreementTerms, termRates, termBillingMonths, termScopeLines,
  type Customer, type Agreement, type AgreementTerm, type TermRate, type TermBillingMonth, type TermScopeLine,
} from "@workspace/db";
import type { Reader } from "./contractCenterPersistence";
import { compareTermPriority, displayStatus, paymentSummary, recoverPayments, selectInEffectTerm, renewalDue } from "./contractCenterService";
import { companyToday } from "./companyDay";

export interface CustomerContractInputs {
  customers: Customer[]; agreements: Agreement[]; terms: AgreementTerm[];
  rates?: TermRate[]; billingMonths?: TermBillingMonth[]; scope?: TermScopeLine[];
}

/** Commercial facts are read-only projections, never a second persisted owner.
 * Select one effective season PER agreement; independent agreements must survive.
 * An effective property agreement takes precedence over inherited agreements.
 * Route scope selection remains the separate service/year resolver.
 */
export function customerContractProjector(data: CustomerContractInputs, today = companyToday()) {
  const properties = new Map(data.customers.map(c => [c.id, c]));
  const byAgreement = new Map<string, AgreementTerm[]>();
  const byOwner = new Map<string, Agreement[]>();
  for (const a of data.agreements) {
    if (!properties.has(a.customerId)) continue;
    const group = byOwner.get(a.customerId) ?? []; group.push(a); byOwner.set(a.customerId, group);
  }
  for (const t of data.terms) {
    const group = byAgreement.get(t.agreementId) ?? []; group.push(t); byAgreement.set(t.agreementId, group);
  }
  const selected = (owner: string, period: "current" | "upcoming" | "previous") =>
    (byOwner.get(owner) ?? []).flatMap(a => {
      const terms = byAgreement.get(a.id) ?? [];
      const term = period === "current" ? selectInEffectTerm(terms, today)
        : period === "upcoming" ? terms.filter(t => ["signed", "active", "renewed"].includes(t.status) && t.startDate > today)
          .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))[0]
        : terms.filter(t => ["signed", "active", "renewed"].includes(t.status) && t.endDate < today)
          .sort((a, b) => b.endDate.localeCompare(a.endDate) || compareTermPriority(a, b))[0];
      return term ? [{ term, agreement: a }] : [];
    });
  const billing = new Map<string, TermBillingMonth[]>(), rates = new Map<string, TermRate[]>(), scope = new Map<string, TermScopeLine[]>();
  for (const row of data.billingMonths ?? []) { const group = billing.get(row.termId) ?? []; group.push(row); billing.set(row.termId, group); }
  for (const row of data.rates ?? []) { const group = rates.get(row.termId) ?? []; group.push(row); rates.set(row.termId, group); }
  for (const row of data.scope ?? []) { const group = scope.get(row.termId) ?? []; group.push(row); scope.set(row.termId, group); }
  return (customerId: string) => {
    const customer = properties.get(customerId);
    if (!customer) return null;
    const parent = customer.parentCustomerId && properties.get(customer.parentCustomerId);
    const period = (kind: "current" | "upcoming" | "previous") => {
      const own = selected(customerId, kind);
      const rows = own.length || !parent ? own : selected(parent.id, kind);
      return rows.map(({ term: t, agreement: a }) => {
        const payments = billing.get(t.id) ?? [];
        return {
          agreementId: a.id, termId: t.id, label: t.seasonLabel, line: t.line, form: t.form,
          startDate: t.startDate, endDate: t.endDate, status: displayStatus(t, byAgreement.get(a.id), today),
          renewalDue: renewalDue(t, byAgreement.get(a.id), today),
          annualCents: paymentSummary(recoverPayments(payments), t.line, t.snowPricing).annualPriceCents,
          snowPricing: t.snowPricing, snowTriggers: t.snowTriggers,
          parentCustomerId: a.customerId !== customerId ? a.customerId : null,
          billingMonths: payments.map(p => ({ month: p.month, component: p.component, amountCents: p.amountCents })).sort((a, b) => a.month.localeCompare(b.month)),
          rates: [...(rates.get(t.id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map(r => ({
            rateKey: r.rateKey, line: r.line, category: r.category, label: r.label, unit: r.unit,
            minimum: r.minimum, priceCents: r.priceCents, priceText: r.priceText, sortOrder: r.sortOrder,
          })),
          scope: (scope.get(t.id) ?? []).filter(s => s.included).map(s => ({
            serviceKey: s.serviceKey, label: (s.details as { label?: string } | null)?.label ?? s.serviceKey, quantity: s.quantity, monthSpread: s.monthSpread,
          })),
        };
      });
    };
    const current = period("current");
    return { asOf: today, current, upcoming: period("upcoming"), previous: period("previous"),
      coverage: { landscape: current.some(t => t.line === "landscape" || t.line === "both"),
        snow: current.some(t => t.line === "snow" || t.line === "both") },
      parentCustomerId: current.find(t => t.parentCustomerId)?.parentCustomerId ?? null };
  };
}

export type CustomerContractSummary = NonNullable<ReturnType<ReturnType<typeof customerContractProjector>>>;
/** Explicit allowlist: no historical/future/nested commercial data for field readers. */
export function projectContractSummary(summary: CustomerContractSummary, commercial: boolean) {
  if (commercial) return summary;
  return { asOf: summary.asOf, coverage: summary.coverage,
    current: summary.current.map(t => ({ line: t.line, label: t.label, startDate: t.startDate, endDate: t.endDate })),
  };
}

export async function loadCustomerContractInputs(reader: Reader, companyId: string, commercial = true): Promise<CustomerContractInputs> {
  const properties = await reader.select().from(customers).where(eq(customers.companyId, companyId));
  const owners = await reader.select().from(agreements).where(eq(agreements.companyId, companyId));
  const terms = await reader.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
  if (!commercial) return { customers: properties, agreements: owners, terms };
  const billingMonths = await reader.select().from(termBillingMonths).where(eq(termBillingMonths.companyId, companyId));
  const rates = await reader.select().from(termRates).where(eq(termRates.companyId, companyId));
  const scope = await reader.select().from(termScopeLines).where(eq(termScopeLines.companyId, companyId));
  return { customers: properties, agreements: owners, terms, billingMonths, rates, scope };
}

/** Batched date-specific line coverage; never reads the retired snow switch. */
export async function snowCoveredCustomerIds(reader: Reader, companyId: string, date = companyToday()) {
  const data = await loadCustomerContractInputs(reader, companyId, false), project = customerContractProjector(data, date);
  return new Set(data.customers.filter(c => project(c.id)?.coverage.snow).map(c => c.id));
}
