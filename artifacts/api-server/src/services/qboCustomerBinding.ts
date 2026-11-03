import { and, eq, inArray } from "drizzle-orm";
import { customers, qboCustomerCache, qboCustomerReviews } from "@workspace/db";
import { type AppTransaction } from "../db";
import { billsThroughParent } from "./customerBilling";
import { initialBillingPatch } from "./qboCustomerComparison";
import type { QboCustomerFields } from "./qboCustomerMap";
import { lockedCustomer } from "./qboCustomerPush";
import { CustomerSyncError, withCustomerSyncLock } from "./qboCustomerSync";

/** All binding paths serialize with pulls, mode transitions, pushes and unlink. */
export async function bindCustomerLocked(tx: AppTransaction, companyId: string, customerId: string, qboId: string, actorId?: string) {
  const [cache] = await tx.select().from(qboCustomerCache).where(and(eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, qboId)));
  if (!cache) return { conflict: false, notFound: "qbo" as const };
  if (!cache.normalized || cache.syncToken == null)
    throw new CustomerSyncError(409, "Refresh the QuickBooks customer cache before linking; billing baseline or SyncToken is missing.");
  const c = await lockedCustomer(tx, companyId, customerId);
  if (!c) return { conflict: false, notFound: "customer" as const };
  const parent = c.parentCustomerId ? await lockedCustomer(tx, companyId, c.parentCustomerId) : undefined;
  if (billsThroughParent(c, parent)) throw new CustomerSyncError(409, "Master-billed branches use their parent's QuickBooks customer");
  if (c.parentCustomerId && (!parent || parent.parentCustomerId || !parent.qboCustomerId || cache.parentQboId !== parent.qboCustomerId))
    throw new CustomerSyncError(409, "QuickBooks and CRM parent bindings must match");
  if (!c.parentCustomerId && cache.parentQboId)
    throw new CustomerSyncError(409, "Select a CRM branch with the matching parent");
  const [existing] = await tx.select({ id: customers.id }).from(customers).where(and(
    eq(customers.companyId, companyId), eq(customers.qboCustomerId, qboId)));
  if (existing && existing.id !== customerId) return { conflict: true };
  // Explicit linking is the other authorized hydration boundary besides initial
  // reconciliation. The cache is a read-only mirror; baseline/reviews are snapshots.
  const billing = initialBillingPatch(c, cache.normalized as QboCustomerFields);
  await tx.update(customers).set({ ...billing, qboCustomerId: qboId, qboDisplayName: cache.displayName,
    qboSyncToken: cache.syncToken, qboBaseline: cache.normalized, qboSyncState: "in_sync",
    qboLastError: null, qboSyncedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(customers.companyId, companyId), eq(customers.id, customerId)));
  await tx.update(qboCustomerReviews).set({ status: "resolved", resolution: "link",
    customerId, resolvedById: actorId ?? null, resolvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.qboId, qboId),
      eq(qboCustomerReviews.status, "open"), inArray(qboCustomerReviews.kind, ["new_in_qbo", "sub_customer"])));
  return { conflict: false };
}
export function bindCustomer(companyId: string, customerId: string, qboId: string, actorId?: string) {
  return withCustomerSyncLock(companyId, tx => bindCustomerLocked(tx, companyId, customerId, qboId, actorId));
}
export async function unlinkCustomerLocked(tx: AppTransaction, companyId: string, customerId: string) {
  const c = await lockedCustomer(tx, companyId, customerId);
  if (!c) throw new CustomerSyncError(404, "CRM customer not found");
  await tx.update(customers).set({ qboCustomerId: null, qboDisplayName: null, qboSyncToken: null,
    qboBaseline: null, qboSyncState: "not_linked", qboSyncedAt: null, qboLastError: null, updatedAt: new Date() })
    .where(and(eq(customers.companyId, companyId), eq(customers.id, customerId)));
}
