import { and, eq, asc, desc, sql, getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  agreements, agreementTerms, customers, propertyManagementCompanies, termScopeLines,
  termRates, termBillingMonths, termDocuments, termStatusHistory, rateCardItems,
  users, type AgreementTerm, type TermStatus,
} from "@workspace/db";
import { db } from "../db";
import { ContractCenterError, displayStatus, selectCurrent, selectRenewalSource, renewalDue, allowedMoves, renewalSet, recoverPayments } from "./contractCenterService";
import { addCalendarDays, calendarDaysBetween, companyToday } from "./companyDay";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Reader = Pick<typeof db, "select">;
export interface ContractListFilter {
  line?: "landscape" | "snow";
  customerId?: string;
  includeParent?: "true" | "false";
  q?: string;
}

/** Shared board/list population. Queries are bounded independently of agreement count.
 * Bid-linked lists retain their distinct response contract in loadLinkedContracts. */
export async function loadContractList(reader: Reader, companyId: string, filter: ContractListFilter = {}, today = companyToday()) {
  // A Reader may be a transaction's single pg client; avoid concurrent client.query calls.
  const companyCustomers = await reader.select().from(customers).where(eq(customers.companyId, companyId));
  const rows = await reader.select().from(agreements).where(eq(agreements.companyId, companyId));
  const terms = await reader.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
  const owners = new Map(companyCustomers.map(c => [c.id, c]));
  const customer = filter.customerId ? owners.get(filter.customerId) : undefined;
  if (filter.customerId && !customer) throw new ContractCenterError(404, "Customer not found");
  const parent = filter.includeParent === "true" && customer?.parentCustomerId
    ? owners.get(customer.parentCustomerId) : undefined;
  const billing = parent ? await reader.select().from(termBillingMonths).where(eq(termBillingMonths.companyId, companyId)) : [];
  const byAgreement = new Map<string, AgreementTerm[]>();
  for (const term of terms) {
    const group = byAgreement.get(term.agreementId) ?? [];
    group.push(term); byAgreement.set(term.agreementId, group);
  }
  const locationCounts = new Map<string, number>();
  for (const c of companyCustomers) if (c.parentCustomerId)
    locationCounts.set(c.parentCustomerId, (locationCounts.get(c.parentCustomerId) ?? 0) + 1);
  const billingByTerm = new Map<string, typeof billing>();
  for (const b of billing) {
    const group = billingByTerm.get(b.termId) ?? [];
    group.push(b); billingByTerm.set(b.termId, group);
  }
  return rows.flatMap(agreement => {
    const owner = owners.get(agreement.customerId);
    if (!owner || (filter.q && !owner.name.toLowerCase().includes(filter.q.toLowerCase())) ||
      (filter.customerId && agreement.customerId !== filter.customerId && agreement.customerId !== parent?.id)) return [];
    const summary = listSummary(byAgreement.get(agreement.id) ?? [], today);
    if (filter.line && ![summary.current ?? summary.latest, summary.renewalDraft]
      .some(t => t?.line === filter.line || t?.line === "both")) return [];
    const viaParent = !!parent && agreement.customerId === parent.id;
    const term = summary.current ?? summary.renewalDraft ?? summary.latest;
    const display = summary.current ?? summary.latest;
    return [{ ...agreement, line: display?.line, form: display?.form, customerName: owner.name, ...summary,
      locationCount: owner.isParent === "true" ? locationCounts.get(owner.id) ?? 0 : 0,
      ...(viaParent ? { viaParent: true, parentName: owner.name,
        branch: { name: customer!.name, billingCode: customer!.customerNumber },
        payments: term ? recoverPayments(billingByTerm.get(term.id) ?? []) : [] } : {}) }];
  });
}

export interface RenewalDueRow {
  agreementId: string; customerId: string; customerName: string;
  line: AgreementTerm["line"]; termId: string; seasonLabel: string; endDate: string;
  daysLeft: number; renewalDraftStatus: "draft" | "sent" | null;
}
export async function loadRenewalsDue(reader: Reader, companyId: string, today = companyToday()): Promise<RenewalDueRow[]> {
  const items = await loadContractList(reader, companyId, {}, today);
  return items.flatMap(item => {
    const term = item.current;
    // listSummary/displayStatus already suppress signed replacements, including future years.
    if (!term || !(item.renewalDue || term.displayStatus === "expired")) return [];
    const status = item.renewalDraft?.status;
    return [{ agreementId: item.id, customerId: item.customerId, customerName: item.customerName,
      line: term.line, termId: term.id, seasonLabel: term.seasonLabel, endDate: term.endDate,
      daysLeft: calendarDaysBetween(today, term.endDate),
      renewalDraftStatus: status === "draft" || status === "sent" ? status : null }];
  }).sort((a, b) => a.endDate.localeCompare(b.endDate) || a.agreementId.localeCompare(b.agreementId));
}

export async function contractsSection(reader: Reader, companyId: string, today = companyToday()) {
  const rows = await loadRenewalsDue(reader, companyId, today);
  const actionable = rows.filter(row => row.renewalDraftStatus === null);
  const first = actionable[0];
  return { count: actionable.length, overdue: actionable.filter(row => row.daysLeft <= 30).length,
    mostOverdue: first ? { agreementId: first.agreementId, customerName: first.customerName,
      endDate: first.endDate, daysLeft: first.daysLeft } : null,
    // Keep season-owned presentation data from the very same read, not a second eligibility query.
    rows };
}
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
/** Keep microseconds; Date truncates them and can group separate transactions. */
export async function agreementSeasons(reader: Reader, companyId: string, agreementId: string) {
  return reader.select({ ...getTableColumns(agreementTerms),
    createdAtExact: sql<string>`${agreementTerms.createdAt}::text`,
    renewalNote: sql<string | null>`(select h.note from term_status_history h
      where h.term_id = agreement_terms.id and h.company_id = agreement_terms.company_id
      and h.note like 'Renewed from % (year % of % renewal,%'
      order by h.created_at, h.id limit 1)` })
    .from(agreementTerms).where(and(eq(agreementTerms.agreementId, agreementId), eq(agreementTerms.companyId, companyId)))
    .orderBy(asc(agreementTerms.startDate), asc(agreementTerms.createdAt));
}
export async function fullDetail(reader: Reader, companyId: string, agreementId: string) {
  const agreement = await getAgreement(reader, companyId, agreementId);
  const [customer] = await reader.select().from(customers).where(and(eq(customers.id, agreement.customerId), eq(customers.companyId, companyId)));
  if (!customer) throw new ContractCenterError(404, "Customer not found");
  const managementId = agreement.propertyManagementCompanyId ?? customer.propertyManagementCompanyId;
  const [managementCompany] = managementId ? await reader.select().from(propertyManagementCompanies)
    .where(and(eq(propertyManagementCompanies.id, managementId), eq(propertyManagementCompanies.companyId, companyId))) : [];
  const terms = await agreementSeasons(reader, companyId, agreementId);
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
    const set = renewalSet(terms, term), first = set[0], year = set.findIndex(t => t.id === term.id) + 1;
    const editable = (editableIds.has(term.id) || ["draft", "sent"].includes(term.status)) && !["renewed", "lost", "cancelled"].includes(term.status);
    return { ...term, displayStatus: displayStatus(term, terms), editable,
      renewalSet: { firstTermId: first.id, firstSeason: first.seasonLabel, lastSeason: set[set.length - 1].seasonLabel, year, length: set.length },
      signedDocumentTermId: first.id,
      allowedMoves: year === 1 && (editable || set.length > 1) ? allowedMoves(set[set.length - 1].status, !!first.renewedFromTermId, !!first.bidTicketId) : [],
      scope, rates, billingMonths,
      documents: documents.map(d => ({ ...d, uploadedByName: d.uploadedBy ? names.get(d.uploadedBy) ?? d.uploadedBy : "System" })),
      history: history.map(h => ({ ...h, changedByName: h.changedBy ? names.get(h.changedBy) ?? h.changedBy : "System" })) };
  }));
  const display = summary.current ?? summary.latest;
  return { ...agreement, line: display?.line, form: display?.form, customer: { id: customer.id, name: customer.name,
    address: `${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`,
    street: customer.street, city: customer.city, state: customer.state, zip: customer.zip,
    managementCompany: managementCompany ?? customer.managementCompany }, terms: nested,
    currentTermId: summary.current?.id ?? null, renewalDraftId: summary.renewalDraft?.id ?? null,
    renewalDue: summary.renewalDue };
}
export function listSummary(terms: AgreementTerm[], today = companyToday()) {
  const current = selectCurrent(terms, today);
  const summarize = (t: AgreementTerm) => ({ id: t.id, seasonLabel: t.seasonLabel, line: t.line, form: t.form,
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
