import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, or, sql, count, inArray } from "drizzle-orm";
import { customers, propertyManagementCompanies, qboConnections, qboCustomerCache, qboCustomerReviews,
  type Customer, type QboReviewFields, type QboReviewKind, type QboConnection } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { logger } from "../lib/logger";
import { qboRequest } from "./qboClient";
import { billsThroughParent, resolveBillTo } from "./customerBilling";
import { crmToQboFields, FIELD_KEYS, normalize, qboToFields, type QboCustomerFields } from "./qboCustomerMap";
import { compareRemote, equal, initialBillingPatch, ownedKeys } from "./qboCustomerComparison";
import { retryPendingCustomerPushes } from "./qboCustomerPush";
import { validateOutgoingZips } from "./customerZip";

type Raw = Record<string, unknown>;
const scope = new AsyncLocalStorage<{ companyId: string; tx: AppTransaction; committed: (() => void)[] }>();
export const CUSTOMER_SYNC_INTERVAL = 15 * 60_000;
const DAY = 24 * 60 * 60_000;
export class CustomerSyncError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class CustomerSyncBusyError extends CustomerSyncError {
  constructor() { super(503, "Customer sync busy, try again"); }
}
/** Drizzle wraps the PostgreSQL error in cause; do not match unrelated messages. */
function isLockTimeout(err: unknown): boolean {
  const seen = new Set<unknown>();
  while (err && typeof err === "object" && !seen.has(err)) {
    seen.add(err);
    if ("code" in err && err.code === "55P03") return true;
    err = "cause" in err ? err.cause : undefined;
  }
  return false;
}
/** Shared cross-process lock for local application and bounded pushes. Nested calls reuse
 * the same transaction; never open a second connection waiting on our own lock. */
export async function withCustomerSyncLock<T>(companyId: string, work: (tx: AppTransaction) => Promise<T>): Promise<T> {
  const current = scope.getStore();
  if (current) {
    if (current.companyId !== companyId) throw new Error("CUSTOMER_SYNC_COMPANY_MISMATCH");
    return work(current.tx);
  }
  const committed: (() => void)[] = [];
  let result: T;
  try {
    result = await db.transaction(async tx => {
      await tx.execute(sql`SET LOCAL lock_timeout = '15s'`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`qbo-customers:${companyId}`},0))`);
      // Do NOT bind the ambient db proxy here: qboRequest may rotate OAuth
      // credentials. Those must commit independently even if reconciliation rolls
      // back later. Mirror/review/billing writes explicitly use this transaction.
      return scope.run({ companyId, tx, committed }, () => work(tx));
    });
  } catch (err) {
    // The transaction promise rejects only after rollback and connection release.
    if (!isLockTimeout(err)) throw err;
    logger.warn({ companyId, err }, "Customer sync lock timed out");
    throw new CustomerSyncBusyError();
  }
  for (const callback of committed) callback();
  return result;
}
/** Register only local post-commit work; rollback discards these callbacks. */
export function onCustomerSyncCommit(callback: () => void) {
  const current = scope.getStore();
  if (!current) throw new Error("CUSTOMER_SYNC_TRANSACTION_REQUIRED");
  current.committed.push(callback);
}
async function connection(tx: Pick<AppTransaction, "select">, companyId: string) {
  const [conn] = await tx.select().from(qboConnections).where(eq(qboConnections.companyId, companyId));
  if (!conn || conn.status !== "connected") throw new CustomerSyncError(409, "QuickBooks is not connected");
  return conn;
}
async function applicationConnection(tx: AppTransaction, companyId: string) {
  const [conn] = await tx.select().from(qboConnections).where(eq(qboConnections.companyId, companyId)).for("update");
  if (!conn || conn.status !== "connected") throw new CustomerSyncError(409, "QuickBooks is not connected");
  return conn;
}
function date(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new CustomerSyncError(502, "Invalid QuickBooks customer timestamp");
  return d;
}
async function billing(tx: AppTransaction, companyId: string, customer: Customer) {
  return resolveBillTo(customer, {
    companyId,
    getCustomerById: async id => (await tx.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, id))))[0],
    getPropertyManagementCompanyById: async id => (await tx.select().from(propertyManagementCompanies)
      .where(and(eq(propertyManagementCompanies.companyId, companyId), eq(propertyManagementCompanies.id, id))))[0],
  });
}
async function crmFields(tx: AppTransaction, companyId: string, c: Customer, parent?: Customer, validate = true) {
  const bill = await billing(tx, companyId, c);
  // Incomplete custom address remains incomplete, not a property fallback during comparison.
  const value = "problem" in bill ? { name: c.billingName ?? c.name, lines: [],
    street: c.billToMode === "custom" ? c.billStreet : null, street2: c.billStreet2,
    city: c.billToMode === "custom" ? c.billCity : null, state: c.billToMode === "custom" ? c.billState : null,
    zip: c.billToMode === "custom" ? c.billZip : null } : bill;
  const fields = crmToQboFields(c, value, parent);
  if (validate) validateOutgoingZips(fields);
  return normalize(fields);
}
async function fieldFailure(tx: AppTransaction, companyId: string, c: Customer, snapshot: unknown, err: unknown) {
  // A database failure aborts PostgreSQL's transaction and cannot be isolated here.
  if (err && typeof err === "object" && "query" in err) throw err;
  const message = err instanceof Error ? err.message : String(err);
  logger.warn({ companyId, customerId: c.id, message }, "QuickBooks customer comparison skipped");
  await raiseCustomerReview(tx, companyId, c.id, c.qboCustomerId, "push_failed", {}, snapshot, message);
}
/** Merge on either partial unique subject. The company lock serializes callers
 * using this service; ON CONFLICT covers a concurrent external review producer. */
export async function raiseCustomerReview(tx: AppTransaction, companyId: string, customerId: string | null,
  qboId: string | null, kind: QboReviewKind, fields: QboReviewFields, snapshot: unknown, message?: string) {
  if (!customerId && !qboId) throw new Error("REVIEW_SUBJECT_REQUIRED");
  const subject = or(...[customerId ? eq(qboCustomerReviews.customerId, customerId) : undefined,
    qboId ? eq(qboCustomerReviews.qboId, qboId) : undefined].filter((v): v is NonNullable<typeof v> => !!v));
  const predicate = and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.kind, kind),
    eq(qboCustomerReviews.status, "open"), subject);
  const existing = await tx.select().from(qboCustomerReviews).where(predicate).for("update");
  if (existing.length > 1) {
    // A former unbound subject and a customer-only failure can converge after binding.
    // Retain the older row, preserve all evidence, retire the redundant open subject.
    existing.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const duplicate of existing.slice(1)) await tx.update(qboCustomerReviews).set({
      status: "resolved", resolution: "Merged into existing open review", resolvedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.id, duplicate.id)));
  }
  const mergedFields = Object.assign({}, ...existing.map(r => r.fields ?? {}), fields);
  if (existing[0]) {
    await tx.update(qboCustomerReviews).set({ customerId: customerId ?? existing[0].customerId,
      qboId: qboId ?? existing[0].qboId, fields: mergedFields, qboSnapshot: snapshot, message: message ?? existing[0].message,
      updatedAt: new Date() }).where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.id, existing[0].id)));
    return;
  }
  const inserted = await tx.insert(qboCustomerReviews).values({ companyId, customerId, qboId, kind, fields,
    qboSnapshot: snapshot, message }).onConflictDoNothing().returning({ id: qboCustomerReviews.id });
  if (!inserted.length) await raiseCustomerReview(tx, companyId, customerId, qboId, kind, fields, snapshot, message);
}
type SyncResult = { pulled: number; inserted: number; updated: number; deactivated: number; staleBindings: number;
  inactiveBindings: number; lastPulledAt: string; reviewsRaised: number };
type IngestResult = { inserted: number; updated: number; reviewsRaised: number };

async function ingest(tx: AppTransaction, companyId: string, records: Raw[], conn: QboConnection): Promise<IngestResult> {
  const result = { inserted: 0, updated: 0, reviewsRaised: 0 };
  const oldRows = await tx.select().from(qboCustomerCache).where(eq(qboCustomerCache.companyId, companyId));
  const oldByQbo = new Map(oldRows.map(r => [r.qboId, r]));
  // Parse and validate the complete batch before writing, then use bounded
  // multi-row upserts rather than a network round trip per unbound record.
  const prepared = records.map(record => {
    const parsed = qboToFields(record);
    if (!parsed.id) throw new CustomerSyncError(502, "QuickBooks returned a customer without an Id");
    const old = oldByQbo.get(parsed.id), deleted = record.status === "Deleted", now = new Date();
    const normalized = deleted ? old?.normalized ?? null : normalize(parsed);
    const mirror = deleted ? {
      displayName: old?.displayName ?? "", companyName: old?.companyName ?? null,
      email: old?.email ?? null, phone: old?.phone ?? null, billAddrLine1: old?.billAddrLine1 ?? null,
      billAddrCity: old?.billAddrCity ?? null, billAddrPostalCode: old?.billAddrPostalCode ?? null,
      billAddrCountrySubDivisionCode: old?.billAddrCountrySubDivisionCode ?? null,
      syncToken: old?.syncToken ?? null, parentQboId: old?.parentQboId ?? null,
      isJob: old?.isJob ?? false, qboCreatedAt: old?.qboCreatedAt ?? null, qboUpdatedAt: old?.qboUpdatedAt ?? null,
      active: false, normalized, syncedAt: now, updatedAt: now,
    } : {
      displayName: parsed.displayName ?? String(record.FullyQualifiedName ?? ""), companyName: parsed.companyName,
      email: parsed.emails.join(",") || null, phone: parsed.phone, billAddrLine1: parsed.billAddr?.street ?? null,
      billAddrCity: parsed.billAddr?.city ?? null, billAddrPostalCode: parsed.billAddr?.zip ?? null,
      billAddrCountrySubDivisionCode: parsed.billAddr?.state ?? null, active: parsed.active, normalized,
      syncToken: parsed.syncToken, parentQboId: parsed.parentQboId, isJob: parsed.job,
      qboCreatedAt: date(parsed.createdAt), qboUpdatedAt: date(parsed.updatedAt), syncedAt: now, updatedAt: now,
    };
    return { record, parsed, deleted, normalized, now, row: { companyId, qboId: parsed.id, ...mirror } };
  });
  const unique = [...new Map(prepared.map(r => [r.row.qboId, r])).values()];
  for (let i = 0; i < unique.length; i += 250) {
    await tx.insert(qboCustomerCache).values(unique.slice(i, i + 250).map(r => r.row))
      .onConflictDoUpdate({ target: [qboCustomerCache.companyId, qboCustomerCache.qboId], set: {
        displayName: sql`excluded.display_name`, companyName: sql`excluded.company_name`, email: sql`excluded.email`,
        phone: sql`excluded.phone`, billAddrLine1: sql`excluded.bill_addr_line1`, billAddrCity: sql`excluded.bill_addr_city`,
        billAddrPostalCode: sql`excluded.bill_addr_postal_code`, billAddrCountrySubDivisionCode: sql`excluded.bill_addr_country_sub_division_code`,
        normalized: sql`excluded.normalized`, syncToken: sql`excluded.sync_token`, parentQboId: sql`excluded.parent_qbo_id`,
        isJob: sql`excluded.is_job`, qboCreatedAt: sql`excluded.qbo_created_at`, qboUpdatedAt: sql`excluded.qbo_updated_at`,
        active: sql`excluded.active`, syncedAt: sql`excluded.synced_at`, updatedAt: sql`excluded.updated_at`,
      } });
  }
  for (const r of unique) oldByQbo.has(r.row.qboId) ? result.updated++ : result.inserted++;
  if (!conn.customerBaselineAt) return result;
  // Customer row locks prevent hydration/baseline writes from losing concurrent CRM edits.
  const crm = await tx.select().from(customers).where(eq(customers.companyId, companyId)).for("update");
  const byId = new Map(crm.map(c => [c.id, c]));
  const byQbo = new Map(crm.filter(c => c.qboCustomerId).map(c => [c.qboCustomerId!, c]));
  for (const { parsed, deleted, normalized, now } of unique) {
    if (!parsed.id) throw new CustomerSyncError(502, "QuickBooks returned a customer without an Id");
    const c = byQbo.get(parsed.id);
    // November 3 clarification: no reviews of ANY kind and no CRM metadata
    // changes before the explicit initial reconciliation establishes a baseline.
    if (!conn.customerBaselineAt) continue;
    const raise = async (kind: QboReviewKind, fields: QboReviewFields = {}) => {
      await raiseCustomerReview(tx, companyId, c?.id ?? null, parsed.id, kind, fields, normalized);
      result.reviewsRaised++;
    };
    if (c) {
      const parent = c.parentCustomerId ? byId.get(c.parentCustomerId) : undefined;
      if (billsThroughParent(c, parent)) continue;
      if (deleted) { await raise("qbo_removed"); continue; }
      if (!parsed.active && c.status === "active") await raise("qbo_inactive");
      await tx.update(customers).set({ qboDisplayName: parsed.displayName, qboSyncedAt: now })
        .where(and(eq(customers.companyId, companyId), eq(customers.id, c.id)));
      const q = normalized as QboCustomerFields;
      let current: QboCustomerFields;
      try { current = await crmFields(tx, companyId, c, parent); }
      catch (err) { await fieldFailure(tx, companyId, c, q, err); result.reviewsRaised++; continue; }
      if (parsed.syncToken !== null && parsed.syncToken === c.qboSyncToken) continue;
      const compared = compareRemote(q, current, (c.qboBaseline ?? {}) as Partial<QboCustomerFields>, ownedKeys());
      // Existing unresolved field evidence must not be bypassed on repeated pulls.
      const [open] = await tx.select().from(qboCustomerReviews).where(and(
        eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.customerId, c.id),
        eq(qboCustomerReviews.kind, "changed_in_qbo"), eq(qboCustomerReviews.status, "open")));
      for (const key of ownedKeys()) if (open?.fields?.[key] && !compared.fields[key]) {
        const b = (c.qboBaseline as Partial<QboCustomerFields> | null)?.[key] ?? null;
        compared.fields[key] = { qbo: q[key], crm: current[key], baseline: b, bothChanged: !equal(current[key], b) };
      }
      const hasReview = Object.keys(compared.fields).length > 0;
      if (hasReview) await raise("changed_in_qbo", compared.fields);
      await tx.update(customers).set({ qboBaseline: compared.baseline,
        ...(!hasReview && !open ? { qboSyncToken: parsed.syncToken } : {}) })
        .where(and(eq(customers.companyId, companyId), eq(customers.id, c.id)));
    } else if (!deleted) {
      const created = date(parsed.createdAt);
      if (created && created > conn.customerBaselineAt) await raise(parsed.parentQboId ? "sub_customer" : "new_in_qbo");
    }
  }
  return result;
}
export async function ingestQboCustomers(companyId: string, records: Raw[]) {
  return withCustomerSyncLock(companyId, async tx => ingest(tx, companyId, records, await connection(tx, companyId)));
}
async function fullRecords(companyId: string): Promise<Raw[]> {
  const all = new Map<string, Raw>();
  for (let start = 1; ; start += 1000) {
    const response = await qboRequest(companyId, "GET", `/query?query=${encodeURIComponent(
      `SELECT * FROM Customer WHERE Active IN (true,false) STARTPOSITION ${start} MAXRESULTS 1000`)}`);
    if (!response.ok) throw new CustomerSyncError(502, `QBO query failed: ${response.status}`);
    const body = await response.json() as { QueryResponse?: { Customer?: Raw[] }; Fault?: unknown };
    if (!body.QueryResponse || body.Fault || (body.QueryResponse.Customer !== undefined && !Array.isArray(body.QueryResponse.Customer)))
      throw new CustomerSyncError(502, "Invalid QuickBooks customer query response");
    const rows = body.QueryResponse.Customer ?? [];
    for (const row of rows) {
      if (!row || typeof row.Id !== "string" || !row.Id || all.has(row.Id))
        throw new CustomerSyncError(502, "Invalid or repeated QuickBooks customer page");
      all.set(row.Id, row);
    }
    if (rows.length < 1000) break;
  }
  return [...all.values()];
}
async function applyFull(tx: AppTransaction, companyId: string, conn: QboConnection, rows: Raw[], startedAt: Date): Promise<SyncResult> {
  const result = await ingest(tx, companyId, rows, conn);
  const ids = rows.map(r => String(r.Id));
  const missing = await tx.update(qboCustomerCache).set({ active: false, updatedAt: new Date() }).where(and(
    eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.active, true),
    sql`${qboCustomerCache.qboId} <> ALL(${sql.param(ids)}::text[])`)).returning({ id: qboCustomerCache.id });
  const bound = await tx.select().from(customers).where(eq(customers.companyId, companyId));
  const present = new Map(rows.map(r => [String(r.Id), r]));
  const stale = bound.filter(c => c.qboCustomerId && !present.has(c.qboCustomerId));
  if (conn.customerBaselineAt) for (const c of stale) {
    const parent = bound.find(p => p.id === c.parentCustomerId);
    if (!billsThroughParent(c, parent)) {
      await raiseCustomerReview(tx, companyId, c.id, c.qboCustomerId, "qbo_removed", {}, null);
      result.reviewsRaised++;
    }
  }
  await tx.update(qboConnections).set({ customerFullPullAt: startedAt,
    ...(conn.customerBaselineAt ? { customerCdcCursor: startedAt } : {}) }).where(eq(qboConnections.companyId, companyId));
  return { pulled: rows.length, inserted: result.inserted, updated: result.updated, deactivated: missing.length,
    staleBindings: stale.length, inactiveBindings: bound.filter(c => c.qboCustomerId && present.get(c.qboCustomerId)?.Active === false).length,
    lastPulledAt: startedAt.toISOString(), reviewsRaised: result.reviewsRaised };
}
/** Reject nested pull entry: acquisition must never inherit a writer transaction. */
function assertUnlockedFetch() {
  if (scope.getStore()) throw new Error("CUSTOMER_PULL_REQUIRES_UNLOCKED_FETCH");
}
function sameConnection(a: QboConnection, b: QboConnection) {
  return a.id === b.id && a.realmId === b.realmId && a.environment === b.environment &&
    a.connectedAt.getTime() === b.connectedAt.getTime();
}
function obsolete(conn: QboConnection, startedAt: Date) {
  return [conn.customerCdcCursor, conn.customerFullPullAt].some(t => t && t >= startedAt);
}
async function newerMirror(tx: AppTransaction, companyId: string, startedAt: Date) {
  // Push echoes, explicit binding and duplicate checks also ingest mirrors, but
  // intentionally do not advance the company's pull cursor. Do not overwrite them.
  const [row] = await tx.select({ id: qboCustomerCache.id }).from(qboCustomerCache).where(and(
    eq(qboCustomerCache.companyId, companyId), sql`${qboCustomerCache.syncedAt} >= ${startedAt}`)).limit(1);
  return !!row;
}
async function acquireFull(companyId: string) {
  assertUnlockedFetch();
  const conn = await connection(db, companyId), startedAt = new Date();
  const rows = await fullRecords(companyId);
  return { conn, startedAt, rows };
}
function checkAcquisition(before: QboConnection, current: QboConnection) {
  if (!sameConnection(before, current)) throw new CustomerSyncError(409, "QuickBooks connection changed during fetch; retry");
}
export async function runFullCustomerPull(companyId: string) {
  const fetched = await acquireFull(companyId);
  return withCustomerSyncLock(companyId, async tx => {
    const conn = await applicationConnection(tx, companyId);
    checkAcquisition(fetched.conn, conn);
    if (obsolete(conn, fetched.startedAt) || await newerMirror(tx, companyId, fetched.startedAt))
      return { skipped: true, reason: "NEWER_PULL_APPLIED", pulled: 0, inserted: 0, updated: 0,
        deactivated: 0, staleBindings: 0, inactiveBindings: 0, reviewsRaised: 0,
        lastPulledAt: (conn.customerCdcCursor ?? conn.customerFullPullAt ?? fetched.startedAt).toISOString() };
    return applyFull(tx, companyId, conn, fetched.rows, fetched.startedAt);
  });
}
export async function runInitialCustomerSync(companyId: string, _userId: string): Promise<
  SyncResult & { linkedUpdated: number; unboundCrmCustomers: number; qboCustomersNotInCrm: number;
    branchesLinkedUnderMasterParent: { customerId: string; name: string; qboId: string }[] }> {
  const fetched = await acquireFull(companyId);
  // A newer cache-only pull cannot stand in for explicit initial hydration.
  // Reacquire outside the lock rather than hydrating an obsolete snapshot.
  const outcome = await withCustomerSyncLock(companyId, async tx => {
    const conn = await applicationConnection(tx, companyId), { rows, startedAt } = fetched;
    checkAcquisition(fetched.conn, conn);
    if (obsolete(conn, startedAt) || await newerMirror(tx, companyId, startedAt))
      return { retryInitial: true as const };
    // Initial hydration is one-time only. Once a baseline exists, even an
    // explicit retry must respect CRM clears and outstanding review evidence.
    if (conn.customerBaselineAt) {
      const pull = await applyFull(tx, companyId, conn, rows, startedAt);
      const crm = await tx.select().from(customers).where(eq(customers.companyId, companyId));
      const byId = new Map(crm.map(c => [c.id, c]));
      const boundIds = new Set(crm.map(c => c.qboCustomerId).filter(Boolean));
      return { ...pull, linkedUpdated: 0,
        unboundCrmCustomers: crm.filter(c => !c.qboCustomerId).length,
        qboCustomersNotInCrm: rows.filter(r => !boundIds.has(String(r.Id))).length,
        branchesLinkedUnderMasterParent: crm.filter(c => c.qboCustomerId &&
          billsThroughParent(c, c.parentCustomerId ? byId.get(c.parentCustomerId) : undefined))
          .map(c => ({ customerId: c.id, name: c.name, qboId: c.qboCustomerId! })),
      };
    }
    // The first reconciliation keeps ordinary ingestion cache-only, then
    // separately performs its explicitly authorized empty-slot hydration.
    const pull = await applyFull(tx, companyId, { ...conn, customerBaselineAt: null }, rows, startedAt);
    const crm = await tx.select().from(customers).where(eq(customers.companyId, companyId)).for("update");
    const byQbo = new Map(rows.map(r => [String(r.Id), r]));
    const branchesLinkedUnderMasterParent: { customerId: string; name: string; qboId: string }[] = [];
    let linkedUpdated = 0, reviewsRaised = 0;
    for (const c of crm) {
      if (!c.qboCustomerId) continue;
      const parent = crm.find(p => p.id === c.parentCustomerId);
      if (billsThroughParent(c, parent)) {
        branchesLinkedUnderMasterParent.push({ customerId: c.id, name: c.name, qboId: c.qboCustomerId }); continue;
      }
      const raw = byQbo.get(c.qboCustomerId);
      if (!raw) {
        await raiseCustomerReview(tx, companyId, c.id, c.qboCustomerId, "qbo_removed", {}, null); reviewsRaised++; continue;
      }
      const parsed = qboToFields(raw), q = normalize(parsed);
      let patch: Partial<Customer>, current: QboCustomerFields;
      try {
        // Validate only the existing CRM values, never newly hydrated QBO postal text.
        await crmFields(tx, companyId, c, parent);
        patch = initialBillingPatch(c, q);
        current = await crmFields(tx, companyId, { ...c, ...patch }, parent, false);
      } catch (err) { await fieldFailure(tx, companyId, c, q, err); reviewsRaised++; continue; }
      const keys = ownedKeys();
      const conflicts: QboReviewFields = {};
      // shipAddr differences are unsent CRM work, never a QuickBooks overwrite.
      // Missing remote values also remain pending_push, not initial conflicts.
      for (const key of keys) if (key !== "shipAddr" && !equal(current[key], q[key]) &&
        current[key] != null && q[key] != null && (!Array.isArray(q[key]) || q[key].length > 0)) {
        conflicts[key] = { qbo: q[key], crm: current[key], baseline: (c.qboBaseline as Partial<QboCustomerFields> | null)?.[key] ?? null, bothChanged: false };
      }
      if (Object.keys(conflicts).length) {
        await raiseCustomerReview(tx, companyId, c.id, c.qboCustomerId, "changed_in_qbo", conflicts, q); reviewsRaised++;
      }
      if (!parsed.active && c.status === "active") {
        await raiseCustomerReview(tx, companyId, c.id, c.qboCustomerId, "qbo_inactive", {}, q); reviewsRaised++;
      }
      await tx.update(customers).set({ ...patch, qboBaseline: q, qboSyncToken: parsed.syncToken,
        qboSyncState: FIELD_KEYS.some(k => !equal(current[k], q[k])) ? "pending_push" : "in_sync",
        qboDisplayName: parsed.displayName, qboSyncedAt: startedAt, updatedAt: new Date() })
        .where(and(eq(customers.companyId, companyId), eq(customers.id, c.id)));
      linkedUpdated++;
    }
    await tx.update(qboConnections).set({ customerBaselineAt: startedAt,
      customerCdcCursor: startedAt, customerFullPullAt: startedAt }).where(eq(qboConnections.companyId, companyId));
    const boundIds = new Set(crm.map(c => c.qboCustomerId).filter(Boolean));
    return { ...pull, linkedUpdated, reviewsRaised, unboundCrmCustomers: crm.filter(c => !c.qboCustomerId).length,
      qboCustomersNotInCrm: rows.filter(r => !boundIds.has(String(r.Id))).length, branchesLinkedUnderMasterParent };
  });
  if ("retryInitial" in outcome) return runInitialCustomerSync(companyId, _userId);
  return outcome;
}
export async function runIncrementalCustomerSync(companyId: string) {
    assertUnlockedFetch();
    const before = await connection(db, companyId), conn = before;
    if (!conn.customerBaselineAt) return { skipped: true, reason: "INITIAL_SYNC_REQUIRED" };
    const startedAt = new Date();
    if (!conn.customerCdcCursor || !conn.customerFullPullAt || startedAt.getTime() - conn.customerCdcCursor.getTime() > 29 * DAY)
      return runFullCustomerPull(companyId);
    const response = await qboRequest(companyId, "GET", `/cdc?entities=Customer&changedSince=${encodeURIComponent(conn.customerCdcCursor.toISOString())}`);
    if (!response.ok) throw new CustomerSyncError(502, `QBO CDC failed: ${response.status}`);
    const body = await response.json() as { CDCResponse?: { QueryResponse?: { Customer?: Raw[]; maxResults?: number }[] }[]; Fault?: unknown };
    if (body.Fault || !Array.isArray(body.CDCResponse) || !body.CDCResponse.length)
      throw new CustomerSyncError(502, "Invalid QuickBooks CDC response");
    const rows: Raw[] = [];
    for (const block of body.CDCResponse) {
      if (!Array.isArray(block.QueryResponse)) throw new CustomerSyncError(502, "Invalid QuickBooks CDC query response");
      for (const query of block.QueryResponse) {
        if (query.Customer !== undefined && !Array.isArray(query.Customer)) throw new CustomerSyncError(502, "Invalid QuickBooks CDC customer list");
        // CDC cannot page: a capped response must recover with a full pull.
        if ((query.Customer?.length ?? 0) >= 1000 || (query.maxResults ?? 0) >= 1000)
          return runFullCustomerPull(companyId);
        rows.push(...query.Customer ?? []);
      }
    }
  return withCustomerSyncLock(companyId, async tx => {
    const current = await applicationConnection(tx, companyId);
    checkAcquisition(before, current);
    if (!current.customerBaselineAt) return { skipped: true, reason: "INITIAL_SYNC_REQUIRED" };
    if (obsolete(current, startedAt) || await newerMirror(tx, companyId, startedAt))
      return { skipped: true, reason: "NEWER_PULL_APPLIED" };
    const result = await ingest(tx, companyId, rows, current);
    await tx.update(qboConnections).set({ customerCdcCursor: startedAt }).where(eq(qboConnections.companyId, companyId));
    return { ...result, pulled: rows.length, lastPulledAt: startedAt.toISOString() };
  });
}
export async function customerSyncStatus(companyId: string) {
  const [conn] = await db.select().from(qboConnections).where(eq(qboConnections.companyId, companyId));
  const [reviews] = await db.select({ count: count() }).from(qboCustomerReviews)
    .where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.status, "open")));
  const last = conn?.customerCdcCursor ?? conn?.customerFullPullAt ?? null;
  return { baselineAt: conn?.customerBaselineAt ?? null, cursor: conn?.customerCdcCursor ?? null,
    fullPullAt: conn?.customerFullPullAt ?? null, lastSyncAt: last,
    nextSyncAt: conn?.customerBaselineAt && last ? new Date(last.getTime() + CUSTOMER_SYNC_INTERVAL) : null, openReviews: reviews?.count ?? 0 };
}
export async function writeCustomerSeedSuggestion(companyId: string, qboId: string, customerId: string, source: string) {
  return withCustomerSyncLock(companyId, async tx => {
    const [c] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, customerId)));
    if (!c) throw new CustomerSyncError(404, "CRM customer not found");
    await tx.update(qboCustomerCache).set({ seedCustomerId: customerId, seedSource: source, updatedAt: new Date() })
      .where(and(eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, qboId)));
  });
}
export async function sweepQboCustomers(onlyCompanyIds?: readonly string[]) {
  const connections = await db.select({ companyId: qboConnections.companyId }).from(qboConnections)
    .where(and(eq(qboConnections.status, "connected"), sql`${qboConnections.customerBaselineAt} IS NOT NULL`,
      onlyCompanyIds ? inArray(qboConnections.companyId, [...onlyCompanyIds]) : undefined));
  for (const { companyId } of connections) {
    try {
        const conn = await connection(db, companyId);
        // Acquisition is unlocked; application rechecks identity and freshness.
        if (!conn.customerBaselineAt) continue;
        const now = Date.now();
        if (!conn.customerFullPullAt || now - conn.customerFullPullAt.getTime() >= DAY) await runFullCustomerPull(companyId);
        else if (!conn.customerCdcCursor || now - conn.customerCdcCursor.getTime() >= CUSTOMER_SYNC_INTERVAL) await runIncrementalCustomerSync(companyId);
    } catch (err) { logger.warn({ err, companyId }, "QuickBooks customer sync failed"); }
    try { await retryPendingCustomerPushes(companyId); }
    catch (err) { logger.warn({ err, companyId }, "QuickBooks customer push retries failed"); }
  }
}
export function startQboCustomerSync() {
  let stopped = false, running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try { await sweepQboCustomers(); } catch (err) { logger.error({ err }, "QuickBooks customer sweep failed"); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, CUSTOMER_SYNC_INTERVAL);
  timer.unref();
  void run();
  return () => { stopped = true; clearInterval(timer); };
}
