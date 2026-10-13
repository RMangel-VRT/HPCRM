import { and, eq, asc, desc } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  agreements, agreementTerms, customers, propertyManagementCompanies, termScopeLines,
  termRates, termBillingMonths, termDocuments, termStatusHistory, rateCardItems,
  type AgreementTerm, type TermStatus,
} from "@workspace/db";
import { db } from "../db";
import { ContractCenterError, displayStatus, selectCurrent, renewalDue } from "./contractCenterService";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Reader = Pick<typeof db, "select">;
export async function getAgreement(reader: Reader, companyId: string, id: string) {
  const [row] = await reader.select().from(agreements).where(and(eq(agreements.id, id), eq(agreements.companyId, companyId)));
  if (!row) throw new ContractCenterError(404, "Contract not found");
  return row;
}
export async function getTerm(reader: Reader, companyId: string, id: string) {
  const [row] = await reader.select().from(agreementTerms).where(and(eq(agreementTerms.id, id), eq(agreementTerms.companyId, companyId)));
  if (!row) throw new ContractCenterError(404, "Term not found");
  return row;
}
export async function lockAgreement(tx: Transaction, companyId: string, id: string) {
  const [row] = await tx.select().from(agreements).where(and(eq(agreements.id, id), eq(agreements.companyId, companyId))).for("update");
  if (!row) throw new ContractCenterError(404, "Contract not found");
  return row;
}
export async function lockTerm(tx: Transaction, companyId: string, id: string) {
  const initial = await getTerm(tx, companyId, id);
  const agreement = await lockAgreement(tx, companyId, initial.agreementId);
  return { term: await getTerm(tx, companyId, id), agreement };
}
export const termWhere = (table: { termId: AnyPgColumn; companyId: AnyPgColumn }, companyId: string, termId: string) =>
  and(eq(table.termId, termId), eq(table.companyId, companyId));

/** All lifecycle term writes use this function, including attributable history. */
export async function writeTerm(tx: Transaction, companyId: string, userId: string,
  previous: AgreementTerm | null, values: Partial<typeof agreementTerms.$inferInsert>, note: string) {
  const [row] = previous
    ? await tx.update(agreementTerms).set({ ...values, updatedAt: new Date() })
      .where(and(eq(agreementTerms.id, previous.id), eq(agreementTerms.companyId, companyId))).returning()
    : await tx.insert(agreementTerms).values({ ...values, companyId, createdBy: userId } as typeof agreementTerms.$inferInsert).returning();
  if (!row) throw new ContractCenterError(404, "Term not found");
  if (!previous || previous.status !== row.status || ["signed", "active"].includes(previous.status)) {
    await tx.insert(termStatusHistory).values({
      companyId, termId: row.id, oldStatus: previous?.status ?? null, newStatus: row.status,
      changedBy: userId, note: previous && previous.status === row.status ? `Edited after signing: ${note}` : note,
    });
  }
  return row;
}
export async function addHistory(tx: Transaction, companyId: string, userId: string, term: AgreementTerm, note: string) {
  await tx.insert(termStatusHistory).values({ companyId, termId: term.id, oldStatus: term.status,
    newStatus: term.status as TermStatus, changedBy: userId, note });
}
export async function activeCard(reader: Reader, companyId: string) {
  return reader.select().from(rateCardItems).where(and(eq(rateCardItems.companyId, companyId), eq(rateCardItems.active, true)));
}
export async function fullDetail(reader: Reader, companyId: string, agreementId: string) {
  const agreement = await getAgreement(reader, companyId, agreementId);
  const [customer] = await reader.select().from(customers).where(and(eq(customers.id, agreement.customerId), eq(customers.companyId, companyId)));
  if (!customer) throw new ContractCenterError(404, "Customer not found");
  const managementId = agreement.propertyManagementCompanyId ?? customer.propertyManagementCompanyId;
  const [managementCompany] = managementId ? await reader.select().from(propertyManagementCompanies)
    .where(and(eq(propertyManagementCompanies.id, managementId), eq(propertyManagementCompanies.companyId, companyId))) : [];
  const terms = await reader.select().from(agreementTerms).where(and(eq(agreementTerms.agreementId, agreementId), eq(agreementTerms.companyId, companyId)))
    .orderBy(asc(agreementTerms.startDate), asc(agreementTerms.createdAt));
  const nested = await Promise.all(terms.map(async term => {
    const [scope, rates, billingMonths, documents, history] = await Promise.all([
      reader.select().from(termScopeLines).where(termWhere(termScopeLines, companyId, term.id)).orderBy(asc(termScopeLines.sortOrder), asc(termScopeLines.serviceKey)),
      reader.select().from(termRates).where(termWhere(termRates, companyId, term.id)).orderBy(asc(termRates.sortOrder), asc(termRates.rateKey)),
      reader.select().from(termBillingMonths).where(termWhere(termBillingMonths, companyId, term.id)).orderBy(asc(termBillingMonths.component), asc(termBillingMonths.month)),
      reader.select().from(termDocuments).where(termWhere(termDocuments, companyId, term.id)).orderBy(desc(termDocuments.createdAt), desc(termDocuments.version)),
      reader.select().from(termStatusHistory).where(termWhere(termStatusHistory, companyId, term.id)).orderBy(desc(termStatusHistory.createdAt), desc(termStatusHistory.id)),
    ]);
    return { ...term, displayStatus: displayStatus(term, terms), scope, rates, billingMonths, documents, history };
  }));
  return { ...agreement, customer: { id: customer.id, name: customer.name,
    address: `${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`,
    street: customer.street, city: customer.city, state: customer.state, zip: customer.zip,
    managementCompany: managementCompany ?? customer.managementCompany }, terms: nested };
}
export function listSummary(terms: AgreementTerm[]) {
  const current = selectCurrent(terms);
  const summarize = (t: AgreementTerm) => ({ id: t.id, seasonLabel: t.seasonLabel,
    startDate: t.startDate, endDate: t.endDate, status: t.status, displayStatus: displayStatus(t, terms),
    annualPriceCents: t.annualPriceCents, snowPricing: t.snowPricing, needsReview: t.needsReview });
  const renewal = current && [...terms].filter(t => t.renewedFromTermId === current.id && ["draft", "sent"].includes(t.status))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
  return { current: current ? summarize(current) : null, renewalDraft: renewal ? summarize(renewal) : null,
    renewalDue: current ? renewalDue(current, terms) : false };
}
