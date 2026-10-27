import { and, eq, inArray } from "drizzle-orm";
import { agreements, agreementTerms, customers, rateCardItems, termRates, type AgreementTerm, type RateCardItem, type TermRate } from "@workspace/db";
import { db } from "../db";
import { applies, ContractCenterError, selectInEffectTerm } from "../lib/contractCenterService";
import { companyToday } from "../lib/companyDay";

export function isLaborRelevant(row: Pick<RateCardItem, "active" | "line" | "category">) {
  const category = row.category.toLowerCase().replace(/&/g, " and ").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  return row.active && ["landscape", "irrigation", "general"].includes(row.line)
    && (category === "labor" || category === "equipment and labor");
}
export function resolveFromRows(card: RateCardItem | undefined, terms: AgreementTerm[], rates: TermRate[], rateKey: string, today = companyToday()) {
  // Select the governing term BEFORE looking up its key; never fall back to an older term.
  // Unknown card keys use the latest eligible term across all service lines.
  const term = selectInEffectTerm(terms.filter(t => !card || applies(t.line, card.line)), today);
  const contract = term && rates.find(r => r.termId === term.id && r.rateKey === rateKey);
  const row = contract ?? card;
  return {
    rateKey, label: row?.label ?? rateKey, unit: row?.unit ?? null,
    rateCents: row?.priceCents ?? null, priceText: row?.priceText ?? null,
    source: contract ? "contract" as const : card ? "rate_card" as const : "unset" as const,
    ...(contract ? { termId: term!.id } : {}),
    cardRateCents: card?.priceCents ?? null, cardPriceText: card?.priceText ?? null,
    contractRateCents: contract?.priceCents ?? null, contractPriceText: contract?.priceText ?? null,
  };
}
export async function loadEstimateRateContext(companyId: string, customerId: string) {
  const [customer] = await db.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.id, customerId)));
  if (!customer) throw new ContractCenterError(404, "Customer not found");
  const [card, joined] = await Promise.all([
    db.select().from(rateCardItems).where(and(eq(rateCardItems.companyId, companyId), eq(rateCardItems.active, true))).orderBy(rateCardItems.sortOrder, rateCardItems.rateKey),
    db.select({ term: agreementTerms }).from(agreementTerms).innerJoin(agreements, eq(agreements.id, agreementTerms.agreementId))
      .where(and(eq(agreements.companyId, companyId), eq(agreements.customerId, customerId), eq(agreementTerms.companyId, companyId))),
  ]);
  const terms = joined.map(r => r.term);
  const rates = terms.length ? await db.select().from(termRates).where(and(eq(termRates.companyId, companyId), inArray(termRates.termId, terms.map(t => t.id)))) : [];
  return { card, terms, rates };
}
export async function resolveEstimateRate(companyId: string, customerId: string, rateKey: string) {
  const { card, terms, rates } = await loadEstimateRateContext(companyId, customerId);
  return resolveFromRows(card.find(r => r.rateKey === rateKey), terms, rates, rateKey);
}
export async function previewEstimateRates(companyId: string, customerId: string) {
  const { card, terms, rates } = await loadEstimateRateContext(companyId, customerId);
  const today = companyToday();
  return { items: card.filter(isLaborRelevant).map(r => resolveFromRows(r, terms, rates, r.rateKey, today)) };
}
