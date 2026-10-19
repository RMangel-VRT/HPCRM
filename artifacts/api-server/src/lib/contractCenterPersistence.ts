import { and, eq, asc, desc } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  agreements, agreementTerms, customers, propertyManagementCompanies, termScopeLines,
  termRates, termBillingMonths, termDocuments, termStatusHistory, rateCardItems,
  users, type AgreementTerm, type TermStatus,
} from "@workspace/db";
import { db } from "../db";
import { ContractCenterError, displayStatus, selectCurrent, selectRenewalSource, renewalDue, allowedMoves } from "./contractCenterService";
import { addCalendarDays, companyToday } from "./companyDay";

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
export async function replaceRows(tx: Transaction, companyId: string, termId: string,
  table: typeof termScopeLines | typeof termRates | typeof termBillingMonths, rows: object[]) {
  await tx.delete(table).where(termWhere(table, companyId, termId));
  if (rows.length) await tx.insert(table).values(rows.map(row => ({ ...row, companyId, termId })) as never);
}

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
  const summary = listSummary(terms);
  const editableIds = new Set([summary.current?.id, summary.renewalDraft?.id].filter(Boolean));
  const nested = await Promise.all(terms.map(async term => {
    const [scope, rates, billingMonths, documents, history] = await Promise.all([
      reader.select().from(termScopeLines).where(termWhere(termScopeLines, companyId, term.id)).orderBy(asc(termScopeLines.sortOrder), asc(termScopeLines.serviceKey)),
      reader.select().from(termRates).where(termWhere(termRates, companyId, term.id)).orderBy(asc(termRates.sortOrder), asc(termRates.rateKey)),
      reader.select().from(termBillingMonths).where(termWhere(termBillingMonths, companyId, term.id)).orderBy(asc(termBillingMonths.component), asc(termBillingMonths.month)),
      reader.select().from(termDocuments).where(termWhere(termDocuments, companyId, term.id)).orderBy(desc(termDocuments.createdAt), desc(termDocuments.version)),
      reader.select().from(termStatusHistory).where(termWhere(termStatusHistory, companyId, term.id)).orderBy(desc(termStatusHistory.createdAt), desc(termStatusHistory.id)),
    ]);
    const actorIds = [...new Set([...documents.map(d => d.uploadedBy), ...history.map(h => h.changedBy)]
      .filter((id): id is string => id !== null))];
    // Resolve only actors referenced by this company-scoped term, not a user directory.
    const actors = await Promise.all(actorIds.map(async id => {
      const [actor] = await reader.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id));
      return [id, actor?.name ?? id] as const;
    }));
    const names = new Map(actors);
    const editable = editableIds.has(term.id) && !["renewed", "lost", "cancelled"].includes(term.status);
    return { ...term, displayStatus: displayStatus(term, terms), editable,
      allowedMoves: editable ? allowedMoves(term.status, !!term.renewedFromTermId) : [],
      scope, rates, billingMonths,
      documents: documents.map(d => ({ ...d, uploadedByName: d.uploadedBy ? names.get(d.uploadedBy) ?? d.uploadedBy : "System" })),
      history: history.map(h => ({ ...h, changedByName: h.changedBy ? names.get(h.changedBy) ?? h.changedBy : "System" })) };
  }));
  return { ...agreement, customer: { id: customer.id, name: customer.name,
    address: `${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`,
    street: customer.street, city: customer.city, state: customer.state, zip: customer.zip,
    managementCompany: managementCompany ?? customer.managementCompany }, terms: nested,
    currentTermId: summary.current?.id ?? null, renewalDraftId: summary.renewalDraft?.id ?? null,
    renewalDue: summary.renewalDue };
}
export function listSummary(terms: AgreementTerm[], today = companyToday()) {
  const current = selectCurrent(terms, today);
  const summarize = (t: AgreementTerm) => ({ id: t.id, seasonLabel: t.seasonLabel,
    startDate: t.startDate, endDate: t.endDate, status: t.status, displayStatus: displayStatus(t, terms, today),
    annualPriceCents: t.annualPriceCents, snowPricing: t.snowPricing, needsReview: t.needsReview,
    signedAt: t.signedAt, snowFlatPriceCents: t.snowFlatPriceCents,
    managingAgentName: t.managingAgentName, billingType: t.billingType });
  // Pending drafts belong to the final renewal source, not necessarily today's displayed season.
  const renewalSource = selectRenewalSource(terms);
  const renewal = renewalSource && [...terms].filter(t => t.renewedFromTermId === renewalSource.id && ["draft", "sent"].includes(t.status))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
  const latest = [...terms].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))[0];
  const recentSigned = [...terms].filter(t => t.signedAt && ["signed", "active", "renewed"].includes(t.status))
    .sort((a, b) => b.signedAt!.getTime() - a.signedAt!.getTime() || b.id.localeCompare(a.id))[0];
  // Count agreements once even when more than one historical season qualifies.
  // Include every source renewed in this window, independently of the displayed season.
  const dueSources = terms.filter(t => ["signed", "active", "renewed"].includes(t.status)
    && t.endDate >= addCalendarDays(today, -60) && addCalendarDays(t.endDate, -60) <= today);
  return { current: current ? summarize(current) : null, renewalDraft: renewal ? summarize(renewal) : null,
    latest: latest ? summarize(latest) : null, recentSigned: recentSigned ? summarize(recentSigned) : null,
    renewalDue: current ? renewalDue(current, terms, today) : false,
    renewalProgress: { due: dueSources.length > 0, signed: dueSources.some(source =>
      terms.some(t => t.renewedFromTermId === source.id && ["signed", "active", "renewed"].includes(t.status))) },
    companyDay: today };
}
