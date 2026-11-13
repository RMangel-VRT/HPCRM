import { and, eq, asc, desc, sql, getTableColumns, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  agreements, agreementTerms, customers, propertyManagementCompanies, termScopeLines,
  termRates, termBillingMonths, termDocuments, termStatusHistory, rateCardItems,
  users, type AgreementTerm, type TermStatus,
} from "@workspace/db";
import { db } from "../db";
import { ContractCenterError, displayStatus, selectCurrent, selectRenewalSource, allowedMoves, renewalSet, recoverPayments, isTermEditable, seasonPaymentSummary } from "./contractCenterService";
import { addCalendarDays, calendarDaysBetween, companyToday } from "./companyDay";
import { coverageResolver } from "./contractCoverage";
import { hasOpenBusiness, isNotRenewing } from "../shared/contractCatalog";
import { contractState, contractRenewalProgress, unclassifiedContract } from "./contractState";
import { missingContractDocument, documentsCovering } from "./contractDocumentCoverage";
import { contractNeedsAction, emptyContractCounts, type ContractProjection } from "@workspace/db/contract-attention";
import { projectActiveCustomers } from "@workspace/db/active-customers";
import { logger } from "./logger";
import { isCalendarDate } from "@workspace/db/estimate-contracts";

const seasonSelection = () => ({ ...getTableColumns(agreementTerms),
  createdAtExact: sql<string>`${agreementTerms.createdAt}::text`,
  renewalNote: sql<string | null>`(select h.note from term_status_history h
    where h.term_id = agreement_terms.id and h.company_id = agreement_terms.company_id
    and h.note like 'Renewed from % (year % of % renewal,%'
    order by h.created_at, h.id limit 1)` });

/** Read-side action hints never grant permissions. Existing endpoints revalidate
 * all moves under lock. Keep lifecycle ownership on year one of a proven set. */
export function projectionActions<T extends AgreementTerm & { createdAtExact?: string; renewalNote?: string | null }>(
  terms: T[], projection: ContractProjection, today: string) {
  const result = { ...projection, allowedActions: ["open"] as ContractProjection["allowedActions"] };
  if (projection.state === "unclassified") return result;
  const source = selectRenewalSource(terms);
  if (["renewal_due", "ended_no_decision"].includes(result.state) && source &&
    !isNotRenewing(source) && ["signed", "active", "expired"].includes(displayStatus(source, terms, today)) &&
    !terms.some(t => t.renewedFromTermId === source.id && ["draft", "sent"].includes(t.status))) {
    result.allowedActions.push("renew", "not_renewing");
    result.actionTermId = source.id;
  }
  if (result.state === "working_unsigned") {
    const term = terms.find(t => t.id === result.stateTermId);
    if (term) {
      const set = renewalSet(terms, term), owner = set[0], last = set[set.length - 1];
      // The status endpoint validates every member, not just the final one.
      if (set.every(t => allowedMoves(t.status === "renewed" && set.length > 1 ? last.status : t.status,
        !!t.renewedFromTermId, !!t.bidTicketId).includes("signed"))) {
        result.allowedActions.push("mark_signed");
        result.actionTermId = owner.id;
      }
    }
  }
  return result;
}

/** Bounded company-scoped operational coverage shared by route fill/import/reporting.
 * Uses the same direct-parent relationship as the Contract Center list.
 */
export async function loadContractCoverage(reader: Reader, companyId: string) {
  const properties = await reader.select().from(customers).where(eq(customers.companyId, companyId));
  const rows = await reader.select().from(agreements).where(eq(agreements.companyId, companyId));
  const terms = await reader.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
  const scopes = await reader.select().from(termScopeLines).where(eq(termScopeLines.companyId, companyId));
  return { properties, resolve: coverageResolver({ customers: properties, agreements: rows, terms, scopes }) };
}

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
  return (await loadContractPopulation(reader, companyId, filter, today)).items;
}
async function loadContractPopulation(reader: Reader, companyId: string, filter: ContractListFilter = {}, today = companyToday()) {
  // A Reader may be a transaction's single pg client; avoid concurrent client.query calls.
  const companyCustomers = await reader.select().from(customers).where(eq(customers.companyId, companyId));
  const rows = await reader.select().from(agreements).where(eq(agreements.companyId, companyId));
  const terms = await reader.select(seasonSelection()).from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
  const documents = await reader.select().from(termDocuments).where(eq(termDocuments.companyId, companyId));
  const owners = new Map(companyCustomers.map(c => [c.id, c]));
  const names = await nonRenewalActorNames(reader, terms);
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
  const items = rows.flatMap(agreement => {
    const owner = owners.get(agreement.customerId);
    if ((filter.q && !(owner?.name ?? "").toLowerCase().includes(filter.q.toLowerCase())) ||
      (filter.customerId && agreement.customerId !== filter.customerId && agreement.customerId !== parent?.id)) return [];
    const seasons = byAgreement.get(agreement.id) ?? [];
    const summary = listSummary(seasons, today, names);
    const projection = projectionActions(seasons, owner ? summary : unclassifiedContract("Customer missing — open and check"), today);
    if (!owner) logger.error({ companyId, agreementId: agreement.id }, "Contract accounting: agreement customer missing");
    if (missingContractDocument(seasons, documents, today)) projection.flags.push("missing_document");
    const display = summary.current ?? summary.latest;
    const applicableLines = (["landscape", "snow"] as const).filter(line =>
      !display || [display, summary.renewalDraft].some(t => t?.line === line || t?.line === "both"));
    if (!applicableLines.length) {
      applicableLines.push("landscape", "snow");
      Object.assign(projection, { ...unclassifiedContract("Contract line missing — open and check"), flags: projection.flags });
    }
    if (projection.state === "unclassified") logger.error({ companyId, agreementId: agreement.id },
      "Contract accounting: agreement classified as unclassified");
    if (filter.line && !applicableLines.includes(filter.line)) return [];
    const viaParent = !!parent && agreement.customerId === parent.id;
    const term = summary.current ?? summary.renewalDraft ?? summary.latest;
    return [{ ...agreement, line: display?.line ?? "both", form: display?.form ?? "ours",
      customerName: owner?.name ?? "Customer unavailable", ...summary, ...projection, applicableLines,
      locationCount: owner?.isParent === "true" ? locationCounts.get(owner.id) ?? 0 : 0,
      ...(viaParent ? { viaParent: true, parentName: owner!.name,
        branch: { name: customer!.name, billingCode: customer!.customerNumber },
        payments: term ? recoverPayments(billingByTerm.get(term.id) ?? []) : [] } : {}) }];
  });
  return { items, companyCustomers, rows, terms };
}

/** Reconcile against the company population, not a filtered display list. This
 * fallback remains explicit even if a future reader accidentally drops a row. */
export function reconcileContractPopulation<T extends { id: string; state: ContractProjection["state"]; applicableLines: readonly string[] }>(
  expected: readonly { id: string }[], input: T[], fallback: (id: string) => T, companyId: string) {
  const byId = new Map(input.map(item => [item.id, item]));
  const items = expected.map(row => {
    const found = byId.get(row.id);
    if (found) return found;
    logger.error({ companyId, agreementId: row.id }, "Contract accounting reconciliation: missing agreement");
    return fallback(row.id);
  });
  const counts = emptyContractCounts();
  for (const item of items) counts[item.state]++;
  if (items.length !== input.length || Object.values(counts).reduce((n, count) => n + count, 0) !== expected.length)
    logger.error({ companyId, total: expected.length, classified: input.length }, "Contract accounting reconciliation mismatch");
  return { items, counts, total: expected.length };
}
export async function loadContractAttention(reader: Reader, companyId: string, today = companyToday()) {
  const population = await loadContractPopulation(reader, companyId, {}, today);
  const reconciled = reconcileContractPopulation(population.rows, population.items, id => {
    const agreement = population.rows.find(row => row.id === id)!;
    return { ...agreement, ...listSummary([], today), ...unclassifiedContract(), line: "both" as const,
      form: "ours" as const, customerName: "Customer unavailable", locationCount: 0,
      applicableLines: ["landscape", "snow"] as ("landscape" | "snow")[] };
  }, companyId);
  const active = projectActiveCustomers({ customers: population.companyCustomers, agreements: population.rows,
    seasons: population.terms, asOf: today });
  const lines = Object.fromEntries((["landscape", "snow"] as const).map(line => {
    const rows = reconciled.items.filter(item => item.applicableLines.includes(line));
    const counts = emptyContractCounts();
    for (const row of rows) counts[row.state]++;
    return [line, { total: rows.length, counts, actionNeeded: rows.filter(row => contractNeedsAction(row.state)).length }];
  }));
  const items = Object.fromEntries(Object.keys(reconciled.counts).map(state =>
    [state, reconciled.items.filter(item => item.state === state && contractNeedsAction(item.state)).map(item => {
      const term = item.stateTerm ?? [item.current, item.renewalDraft, item.latest, item.renewalSource].find(t => t?.id === item.stateTermId)
        ?? item.current ?? item.latest;
      return { ...item, customer: { id: item.customerId, name: item.customerName },
        seasonLabel: term?.seasonLabel ?? null, endDate: term?.endDate ?? null };
    })]));
  return { total: reconciled.total, counts: reconciled.counts, lines, items,
    flagged: { missing_document: reconciled.items.filter(item => item.flags.includes("missing_document")).length,
      active_no_contract: active.counts.noContract }, companyDay: today };
}

export interface RenewalDueRow {
  agreementId: string; customerId: string; customerName: string;
  line: AgreementTerm["line"]; termId: string | null; seasonLabel: string | null; endDate: string | null;
  daysLeft: number | null; renewalDraftStatus: "draft" | "sent" | null;
  state: ContractProjection["state"]; stateReason: string;
}
export async function loadRenewalsDue(reader: Reader, companyId: string, today = companyToday()): Promise<RenewalDueRow[]> {
  const items = await loadContractList(reader, companyId, {}, today);
  return items.flatMap(item => {
    const term = item.stateTerm ?? [item.current, item.renewalDraft, item.latest, item.renewalSource].find(t => t?.id === item.stateTermId)
      ?? item.current ?? item.latest;
    if (!["ended_no_decision", "working_unsigned", "unclassified", "renewal_due", "renewal_in_progress"].includes(item.state)) return [];
    const status = item.renewalDraft?.status;
    return [{ agreementId: item.id, customerId: item.customerId, customerName: item.customerName,
      line: term?.line ?? item.line, termId: term?.id ?? null, seasonLabel: term?.seasonLabel ?? null, endDate: term?.endDate ?? null,
      daysLeft: term ? calendarDaysBetween(today, term.endDate) : null,
      renewalDraftStatus: status === "draft" || status === "sent" ? status : null,
      state: item.state, stateReason: item.stateReason }];
  }).sort((a, b) => (a.endDate ?? "").localeCompare(b.endDate ?? "") || a.agreementId.localeCompare(b.agreementId));
}

export async function contractsSection(reader: Reader, companyId: string, today = companyToday()) {
  const rows = await loadRenewalsDue(reader, companyId, today);
  const actionable = rows.filter(row => ["ended_no_decision", "working_unsigned", "unclassified", "renewal_due"].includes(row.state));
  const first = actionable[0];
  return { count: actionable.length, overdue: actionable.filter(row => row.state !== "renewal_due" || (row.daysLeft !== null && row.daysLeft <= 30)).length,
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
  await lockContractCompany(tx, companyId);
  const [row] = await tx.select().from(agreements).where(and(eq(agreements.id, id), eq(agreements.companyId, companyId))).for("update");
  if (!row) throw new ContractCenterError(404, "Contract not found");
  return row;
}
/** Shared with audit/import writers. Acquire after RFP locks, before agreement/customer locks.
 * The sweep never locks RFPs, so it cannot invert the RFP -> company -> agreement order. */
export async function lockContractCompany(tx: Transaction, companyId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`contract-audit:${companyId}`}))`);
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
export async function writeTerm(tx: Transaction, companyId: string, userId: string | null,
  previous: AgreementTerm | null, values: Partial<typeof agreementTerms.$inferInsert>, note: string,
  historyMode: "edit" | "outcome" = "edit") {
  await lockContractCompany(tx, companyId);
  const [row] = previous
    ? await tx.update(agreementTerms).set({ ...values, updatedAt: new Date() })
      .where(and(eq(agreementTerms.id, previous.id), eq(agreementTerms.companyId, companyId))).returning()
    : await tx.insert(agreementTerms).values({ ...values, companyId, createdBy: userId } as typeof agreementTerms.$inferInsert).returning();
  if (!row) throw new ContractCenterError(404, "Term not found");
  if (historyMode === "outcome" || !previous || previous.status !== row.status || ["signed", "active", "renewed"].includes(previous.status)) {
    await tx.insert(termStatusHistory).values({
      companyId, termId: row.id, oldStatus: previous?.status ?? null, newStatus: row.status,
      changedBy: userId, note: historyMode === "edit" && previous && previous.status === row.status ? `Edited after signing: ${note}` : note,
    });
  }
  return row;
}
export async function addHistory(tx: Transaction, companyId: string, userId: string, term: AgreementTerm, note: string) {
  await tx.insert(termStatusHistory).values({ companyId, termId: term.id, oldStatus: term.status,
    newStatus: term.status as TermStatus, changedBy: userId, note });
}
export async function activeCard(reader: Reader, companyId: string) {
  // Validation needs inactive keys too: they must not masquerade as custom rates.
  return reader.select().from(rateCardItems).where(eq(rateCardItems.companyId, companyId));
}
/** Keep microseconds; Date truncates them and can group separate transactions. */
export async function agreementSeasons(reader: Reader, companyId: string, agreementId: string) {
  return reader.select(seasonSelection())
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
  const today = companyToday(), summary = listSummary(terms, today, await nonRenewalActorNames(reader, terms));
  const customerAgreements = await reader.select().from(agreements).where(and(eq(agreements.companyId, companyId), eq(agreements.customerId, customer.id)));
  const customerTerms = await reader.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
  const otherIds = new Set(customerAgreements.filter(a => a.id !== agreementId).map(a => a.id));
  const otherOpenLines = new Set(customerTerms.filter(t => otherIds.has(t.agreementId) && hasOpenBusiness(t, today)).map(t => t.agreementId)).size;
  const renewalSource = selectRenewalSource(terms);
  const statusEditableIds = new Set([summary.current?.id, summary.renewalDraft?.id].filter(Boolean));
  const nested = await Promise.all(terms.map(async term => {
    const [scope, rates, billingMonths, documents, history] = await Promise.all([
      reader.select().from(termScopeLines).where(termWhere(termScopeLines, companyId, term.id)).orderBy(asc(termScopeLines.sortOrder), asc(termScopeLines.serviceKey)),
      reader.select().from(termRates).where(termWhere(termRates, companyId, term.id)).orderBy(asc(termRates.sortOrder), asc(termRates.rateKey)),
      reader.select().from(termBillingMonths).where(termWhere(termBillingMonths, companyId, term.id)).orderBy(asc(termBillingMonths.component), asc(termBillingMonths.month)),
      reader.select().from(termDocuments).where(termWhere(termDocuments, companyId, term.id)).orderBy(desc(termDocuments.createdAt), desc(termDocuments.version)),
      reader.select().from(termStatusHistory).where(termWhere(termStatusHistory, companyId, term.id)).orderBy(desc(termStatusHistory.createdAt), desc(termStatusHistory.id)),
    ]);
    const actorIds = [...new Set([term.nonRenewalBy, ...documents.map(d => d.uploadedBy), ...history.map(h => h.changedBy)]
      .filter((id): id is string => id !== null))];
    // Resolve only actors referenced by this company-scoped term, not a user directory.
    const actors = await Promise.all(actorIds.map(async id => {
      const [actor] = await reader.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id));
      return [id, actor?.name ?? id] as const;
    }));
    const names = new Map(actors);
    const set = renewalSet(terms, term), first = set[0], year = set.findIndex(t => t.id === term.id) + 1;
    const editable = isTermEditable(term, today);
    const statusEditable = (statusEditableIds.has(term.id) || ["draft", "sent"].includes(term.status)) && !["renewed", "lost", "cancelled"].includes(term.status);
    return { ...term, ...seasonPaymentSummary(term, billingMonths), nonRenewalByName: term.nonRenewalBy ? names.get(term.nonRenewalBy) ?? null : null,
      displayStatus: displayStatus(term, terms), editable,
      renewalSet: { firstTermId: first.id, firstSeason: first.seasonLabel, lastSeason: set[set.length - 1].seasonLabel, year, length: set.length },
      allowedMoves: year === 1 && (statusEditable || set.length > 1) ? allowedMoves(set[set.length - 1].status, !!first.renewedFromTermId, !!first.bidTicketId) : [],
      scope, rates, billingMonths,
      documents: documents.map(d => ({ ...d, uploadedByName: d.uploadedBy ? names.get(d.uploadedBy) ?? d.uploadedBy : "System" })),
      history: history.map(h => ({ ...h, changedByName: h.changedBy ? names.get(h.changedBy) ?? h.changedBy : "System" })) };
  }));
  const allDocuments = nested.flatMap(t => t.documents);
  const withCoverage = nested.map(term => ({ ...term, coveredBy:
    documentsCovering(term, terms, allDocuments).filter(d => d.termId !== term.id).map(document => ({
      ...document, fromTermId: document.termId, fromSeasonLabel: terms.find(t => t.id === document.termId)!.seasonLabel,
    })) }));
  const projection = projectionActions(terms, summary, today);
  if (missingContractDocument(terms, allDocuments, today)) projection.flags.push("missing_document");
  const display = summary.current ?? summary.latest;
  return { ...agreement, line: display?.line, form: display?.form, customer: { id: customer.id, name: customer.name,
    address: `${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`,
    street: customer.street, city: customer.city, state: customer.state, zip: customer.zip,
    managementCompany: managementCompany ?? customer.managementCompany }, terms: withCoverage,
    currentTermId: summary.current?.id ?? null, renewalDraftId: summary.renewalDraft?.id ?? null,
    renewalDue: summary.renewalDue, notRenewing: summary.notRenewing,
    renewalSourceId: renewalSource?.id ?? null,
    canRecordNonRenewal: !!renewalSource && ["signed", "active", "renewed"].includes(renewalSource.status) && !isNotRenewing(renewalSource)
      && !terms.some(t => t.renewedFromTermId === renewalSource.id && ["signed", "active", "renewed"].includes(t.status)),
    ...projection, otherOpenLines, companyDay: today };
}
async function nonRenewalActorNames(reader: Reader, terms: AgreementTerm[]): Promise<Map<string, string>> {
  const ids = [...new Set(terms.map(t => t.nonRenewalBy).filter((id): id is string => !!id))];
  if (!ids.length) return new Map<string, string>();
  const actors = await reader.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  return new Map(actors.map(actor => [actor.id, actor.name]));
}
export function listSummary(terms: AgreementTerm[], today = companyToday(), actorNames = new Map<string, string>()) {
  const projection = contractState(terms, today);
  // Malformed histories still receive a critical state, but must not crash legacy
  // display/sort/date helpers before their unclassified item can reach the UI.
  terms = terms.filter(t => typeof t.id === "string" && typeof t.startDate === "string" && typeof t.endDate === "string" &&
    isCalendarDate(t.startDate) && isCalendarDate(t.endDate) && t.startDate <= t.endDate);
  const current = selectCurrent(terms, today);
  const summarize = (t: AgreementTerm) => ({ id: t.id, seasonLabel: t.seasonLabel, line: t.line, form: t.form,
    startDate: t.startDate, endDate: t.endDate, status: t.status, displayStatus: displayStatus(t, terms, today),
    annualPriceCents: t.annualPriceCents, snowPricing: t.snowPricing, needsReview: t.needsReview,
    signedAt: t.signedAt, snowFlatPriceCents: t.snowFlatPriceCents,
    managingAgentName: t.managingAgentName, billingType: t.billingType,
    nonRenewalOn: t.nonRenewalOn, nonRenewalReason: t.nonRenewalReason,
    nonRenewalCompetitor: t.nonRenewalCompetitor, nonRenewalNote: t.nonRenewalNote,
    nonRenewalByName: t.nonRenewalBy ? actorNames.get(t.nonRenewalBy) ?? null : null,
    deactivateCustomerOnEnd: t.deactivateCustomerOnEnd });
  // Pending drafts belong to the final renewal source, not necessarily today's displayed season.
  const renewalSource = selectRenewalSource(terms);
  const renewal = renewalSource && [...terms].filter(t => t.renewedFromTermId === renewalSource.id && ["draft", "sent"].includes(t.status))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
  const latest = [...terms].filter(t => t.status !== "cancelled").sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))[0];
  const recentSigned = [...terms].filter(t => t.signedAt && ["signed", "active", "renewed"].includes(t.status))
    .sort((a, b) => b.signedAt!.getTime() - a.signedAt!.getTime() || b.id.localeCompare(a.id))[0];
  const representative = terms.find(t => t.id === projection.stateTermId);
  return { current: current ? summarize(current) : null, renewalDraft: renewal ? summarize(renewal) : null,
    stateTerm: representative ? summarize(representative) : null,
    renewalSource: renewalSource ? summarize(renewalSource) : null, notRenewing: isNotRenewing(renewalSource),
    latest: latest ? summarize(latest) : null, recentSigned: recentSigned ? summarize(recentSigned) : null,
    ...projection, renewalDue: projection.state === "renewal_due",
    renewalProgress: contractRenewalProgress(terms, today),
    companyDay: today };
}
