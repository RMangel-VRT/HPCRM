import { and, eq, inArray } from "drizzle-orm";
import { customers, propertyManagementCompanies, qboConnections, qboCustomerReviews, type Customer } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { logger } from "../lib/logger";
import { billsThroughParent, resolveBillTo } from "./customerBilling";
import { equal, ownedKeys } from "./qboCustomerComparison";
import { validateOutgoingZips } from "./customerZip";
import { crmToQboFields, normalize, qboToFields, toQboPayload, validateDisplayName, type QboCustomerFields } from "./qboCustomerMap";
import { isQboWriteEnabled, qboRequest } from "./qboClient";
import { CustomerSyncBusyError, CustomerSyncError, ingestQboCustomers, onCustomerSyncCommit, raiseCustomerReview, withCustomerSyncLock } from "./qboCustomerSync";

type Raw = Record<string, unknown>;
export type PushResult = { state: Customer["qboSyncState"] | "review"; qboId?: string; review?: string };
// Rate-limit metadata, not customer billing facts. Process-local by design; see CQ3 report.
const attempts = new Map<string, number[]>();
const whereCustomer = (companyId: string, id: string) => and(eq(customers.companyId, companyId), eq(customers.id, id));
export async function lockedCustomer(tx: AppTransaction, companyId: string, id: string) {
  return (await tx.select().from(customers).where(whereCustomer(companyId, id)).for("update"))[0];
}
export async function customerFields(tx: AppTransaction, companyId: string, c: Customer, parent?: Customer) {
  const bill = await resolveBillTo(c, {
    companyId,
    getCustomerById: async id => (await tx.select().from(customers).where(whereCustomer(companyId, id)))[0],
    getPropertyManagementCompanyById: async id => (await tx.select().from(propertyManagementCompanies)
      .where(and(eq(propertyManagementCompanies.companyId, companyId), eq(propertyManagementCompanies.id, id))))[0],
  });
  if ("problem" in bill) throw new Error(bill.problem);
  const fields = crmToQboFields(c, bill, parent);
  validateOutgoingZips(fields);
  return normalize(fields);
}
export async function fetchQboCustomer(companyId: string, qboId: string): Promise<Raw> {
  const response = await qboRequest(companyId, "GET", `/customer/${encodeURIComponent(qboId)}`);
  if (!response.ok) throw new CustomerSyncError(502, `QuickBooks customer read failed: ${response.status}`);
  const body = await response.json() as { Customer?: Raw };
  if (!body.Customer || body.Customer.Id !== qboId || body.Customer.status === "Deleted")
    throw new CustomerSyncError(409, "QuickBooks customer is no longer available");
  if (qboToFields(body.Customer).syncToken === null) throw new CustomerSyncError(502, "QuickBooks customer has no SyncToken");
  return body.Customer;
}
export async function exactCustomer(companyId: string, displayName: string) {
  const escaped = displayName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const response = await qboRequest(companyId, "GET", `/query?query=${encodeURIComponent(
    `SELECT * FROM Customer WHERE DisplayName = '${escaped}' MAXRESULTS 1000`)}`);
  if (!response.ok) throw new Error(`QuickBooks duplicate check failed: ${response.status}`);
  const body = await response.json() as { QueryResponse?: { Customer?: Raw[] }; Fault?: unknown };
  if (!body.QueryResponse || body.Fault || (body.QueryResponse.Customer !== undefined && !Array.isArray(body.QueryResponse.Customer)))
    throw new Error("Invalid QuickBooks duplicate check response");
  const records = body.QueryResponse.Customer ?? [];
  if (records.length) await ingestQboCustomers(companyId, records);
  return records.find(r => String(r.DisplayName).trim().toLowerCase() === displayName.trim().toLowerCase());
}
export async function pushCustomer(companyId: string, customerId: string, { reason }: { reason: string }): Promise<PushResult> {
  return withCustomerSyncLock(companyId, tx => pushLocked(tx, companyId, customerId, reason, new Set()));
}
async function pushLocked(tx: AppTransaction, companyId: string, id: string, reason: string, seen: Set<string>): Promise<PushResult> {
  if (seen.has(id)) throw new CustomerSyncError(409, "Customer parent cycle");
  seen.add(id);
  let c = await lockedCustomer(tx, companyId, id);
  if (!c) throw new CustomerSyncError(404, "CRM customer not found");
  let sent: QboCustomerFields | undefined;
  // All queued work rechecks durable state under the same lock as unlink.
  // Only activation/send-now can turn not_linked into an eligible create.
  if (!["pending_push", "error"].includes(c.qboSyncState)) return { state: c.qboSyncState, qboId: c.qboCustomerId ?? undefined };
  const parent = c.parentCustomerId ? await lockedCustomer(tx, companyId, c.parentCustomerId) : undefined;
  if (c.parentCustomerId && (!parent || parent.parentCustomerId || parent.isParent !== "true"))
    return fail("Invalid parent customer");
  if (billsThroughParent(c, parent)) {
    await tx.update(customers).set({ qboSyncState: "via_parent" }).where(whereCustomer(companyId, id));
    return { state: "via_parent" };
  }
  const [conn] = await tx.select().from(qboConnections).where(eq(qboConnections.companyId, companyId));
  if (!conn?.customerBaselineAt || conn.status !== "connected" || !await isQboWriteEnabled(companyId, tx)) {
    await tx.update(customers).set({ qboSyncState: "pending_push" }).where(whereCustomer(companyId, id));
    return { state: "pending_push" };
  }
  const reviews = await tx.select().from(qboCustomerReviews).where(and(
    eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.customerId, id), eq(qboCustomerReviews.status, "open")));
  const blocking = reviews.find(r => r.kind === "qbo_removed" || r.kind === "name_taken");
  if (blocking) return { state: "review", review: blocking.kind };
  const key = `${companyId}:${id}`, now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(t => now - t < 3_600_000);
  if (recent.length >= 3) return { state: c.qboSyncState, review: "push_failed" };
  attempts.set(key, [...recent, now]);
  try {
    if (parent && !parent.qboCustomerId) {
      // Parent-first recursion is not authorization to undo an intentional unlink.
      const [unlinked] = await tx.select({ id: qboCustomerReviews.id }).from(qboCustomerReviews).where(and(
        eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.customerId, parent.id),
        eq(qboCustomerReviews.kind, "qbo_removed"), eq(qboCustomerReviews.resolution, "unlink")));
      if (unlinked && parent.qboSyncState === "not_linked")
        return fail("The parent was unlinked; activate it again or use Send to QuickBooks now");
      await tx.update(customers).set({ qboSyncState: "pending_push" }).where(whereCustomer(companyId, parent.id));
      const result = await pushLocked(tx, companyId, parent.id, "separate-parent", seen);
      if (!result.qboId) return fail("The parent must be linked to QuickBooks first");
      parent.qboCustomerId = result.qboId;
    }
    sent = await customerFields(tx, companyId, c, parent);
    const baseline = (c.qboBaseline ?? {}) as Partial<QboCustomerFields>;
    const held = new Set(reviews.filter(r => r.kind === "changed_in_qbo").flatMap(r => Object.keys(r.fields ?? {})));
    const changed = ownedKeys().filter(k => !held.has(k) && !equal(sent![k], baseline[k]));
    if (c.qboCustomerId && !changed.length) {
      await tx.update(customers).set({ qboSyncState: "in_sync", qboLastError: null }).where(whereCustomer(companyId, id));
      return { state: held.size ? "review" : "in_sync", qboId: c.qboCustomerId };
    }
    validateDisplayName(sent.displayName);
    if (!c.qboCustomerId) {
      const collision = await exactCustomer(companyId, sent.displayName!);
      if (collision) return nameTaken(collision);
    }
    // The pure CQ1 mapper represents Active; the outbound policy NEVER writes it.
    const payload = toQboPayload(sent, { create: !c.qboCustomerId, id: c.qboCustomerId ?? undefined,
      syncToken: c.qboSyncToken ?? undefined, onlyKeys: changed });
    delete payload.Active;
    const response = await qboRequest(companyId, "POST", "/customer", payload);
    const body = await response.json() as { Customer?: Raw; Fault?: { Error?: { code?: string; Detail?: string; Message?: string }[] } };
    if (!response.ok || body.Fault) {
      const errors = body.Fault?.Error ?? [], text = errors.map(e => `${e.Detail ?? ""} ${e.Message ?? ""}`).join("; ");
      if (errors.some(e => String(e.code) === "5010") || /stale[\s_-]*object/i.test(text)) {
        if (!c.qboCustomerId) return fail(text || "Stale QuickBooks object");
        await ingestQboCustomers(companyId, [await fetchQboCustomer(companyId, c.qboCustomerId)]);
        return { state: "review", qboId: c.qboCustomerId, review: "changed_in_qbo" };
      }
      if (errors.some(e => String(e.code) === "6240")) {
        const collision = await exactCustomer(companyId, sent.displayName!);
        return nameTaken(collision, text);
      }
      return fail(text || `QuickBooks customer push failed: ${response.status}`);
    }
    const raw = body.Customer, parsed = qboToFields(raw);
    if (!raw || !parsed.id || parsed.syncToken === null || (c.qboCustomerId && parsed.id !== c.qboCustomerId))
      return fail("Invalid QuickBooks customer push response; reconcile before retrying");
    // Agreed-value snapshot advances ONLY sent keys. Row + company locks prevent
    // concurrent owner edits from being marked synced; later edits queue separately.
    const next = c.qboCustomerId ? { ...baseline } : { ...sent };
    if (c.qboCustomerId) for (const k of changed) Object.assign(next, { [k]: sent[k] });
    await tx.update(customers).set({ qboCustomerId: parsed.id, qboDisplayName: parsed.displayName,
      qboSyncToken: parsed.syncToken, qboBaseline: next, qboSyncState: "in_sync", qboLastError: null,
      qboPushedAt: new Date() }).where(whereCustomer(companyId, id));
    await ingestQboCustomers(companyId, [raw]);
    await tx.update(qboCustomerReviews).set({ status: "resolved",
      resolution: "Resolved by successful push", resolvedAt: new Date(), resolvedById: null, updatedAt: new Date() })
      .where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.customerId, id),
        eq(qboCustomerReviews.kind, "push_failed"), eq(qboCustomerReviews.status, "open")));
    return { state: held.size ? "review" : "in_sync", qboId: parsed.id };
  } catch (err) {
    // SQL failures abort PostgreSQL transactions: let rollback/reconciliation recover.
    if (err && typeof err === "object" && "query" in err) throw err;
    return fail(err instanceof Error ? err.message : "QuickBooks push failed");
  }
  async function fail(message: string): Promise<PushResult> {
    await tx.update(customers).set({ qboSyncState: "error", qboLastError: message }).where(whereCustomer(companyId, id));
    await raiseCustomerReview(tx, companyId, id, c.qboCustomerId, "push_failed", {}, sent ?? null, message);
    logger.warn({ companyId, customerId: id, reason, message }, "QuickBooks customer push failed");
    return { state: "error", review: "push_failed" };
  }
  async function nameTaken(record?: Raw, detail?: string): Promise<PushResult> {
    const message = `QuickBooks name already taken: ${String(record?.DisplayName ?? sent?.displayName)}${detail ? ` (${detail})` : ""}`;
    await raiseCustomerReview(tx, companyId, id, record ? String(record.Id) : null, "name_taken", {},
      record ? normalize(qboToFields(record)) : null, message);
    await tx.update(customers).set({ qboLastError: message }).where(whereCustomer(companyId, id));
    return { state: "review", review: "name_taken" };
  }
}
type PushWorker = { pending: Set<string>; drained: Promise<void> };
const workers = new Map<string, PushWorker>();
/** One transaction at a time per company, including scheduler retries. */
function enqueueCustomerPush(companyId: string, customerId: string): Promise<void> {
  let worker = workers.get(companyId);
  if (!worker) {
    let complete!: () => void;
    worker = { pending: new Set(), drained: new Promise<void>(resolve => { complete = resolve; }) };
    workers.set(companyId, worker);
    const active = worker;
    setImmediate(() => { void drain(companyId, active).finally(complete); });
  }
  worker.pending.add(customerId);
  return worker.drained;
}
async function drain(companyId: string, worker: PushWorker) {
  try {
    for (const customerId of worker.pending) {
      // Remove BEFORE awaiting: a new committed edit while this id is running
      // must add another turn, whereas repeated waiting ids collapse in the Set.
      worker.pending.delete(customerId);
      try {
        await pushCustomer(companyId, customerId, { reason: "queued" });
      } catch (err) {
        // Contention rolls back without changing pending_push or raising a review.
        // No immediate requeue: the durable state remains for the next sweep.
        logger.warn({ err, companyId, customerId }, err instanceof CustomerSyncBusyError
          ? "Queued QuickBooks push busy; scheduler will retry" : "Queued QuickBooks push failed");
      }
    }
  } finally {
    // No await between observing empty and removing: an enqueue cannot be lost.
    workers.delete(companyId);
  }
}
/** Wait for already registered work (also useful for orderly shutdown/tests). */
export async function waitForCustomerPushes(companyId: string): Promise<void> {
  await workers.get(companyId)?.drained;
}
/** Register while the owner transaction is open; never start remote work before commit. */
export function queueCustomerPush(companyId: string, customerId: string) {
  onCustomerSyncCommit(() => { void enqueueCustomerPush(companyId, customerId); });
}
export async function retryPendingCustomerPushes(companyId: string) {
  const pending = await db.select({ id: customers.id }).from(customers).where(and(
    eq(customers.companyId, companyId), inArray(customers.qboSyncState, ["pending_push", "error"])));
  // Enqueue the complete batch before yielding; never create a second push loop.
  await Promise.all(pending.map(c => enqueueCustomerPush(companyId, c.id)));
}
/** Export for future Invoice Center use only; this slice does not change invoice consumers. */
export async function qboCustomerRefFor(customer: Customer): Promise<string | null> {
  if (!customer.parentCustomerId) return customer.qboCustomerId;
  const [parent] = await db.select().from(customers).where(whereCustomer(customer.companyId, customer.parentCustomerId));
  if (!parent || parent.parentCustomerId || parent.isParent !== "true")
    throw new CustomerSyncError(409, "Invalid parent customer");
  return billsThroughParent(customer, parent) ? parent.qboCustomerId : customer.qboCustomerId;
}
