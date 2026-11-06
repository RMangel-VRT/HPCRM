import { and, eq, isNotNull } from "drizzle-orm";
import { customers, propertyManagementCompanies, qboCustomerReviews, type Customer, type InsertCustomer } from "@workspace/db";
import { type AppTransaction } from "../db";
import { CustomerSyncError } from "./qboCustomerSync";
import { lockedCustomer, queueCustomerPush } from "./qboCustomerPush";
import { equal } from "./qboCustomerComparison";
import { assertActivationComplete } from "./customerSetupValidation";
import { validateAccountManagerWrite } from "./accountManagers";

const billingColumns: (keyof Customer)[] = ["billingName", "billingCompanyName", "billingContactName", "billingEmails",
  "billingPhone", "billingMobile", "billToMode", "billStreet", "billStreet2", "billCity", "billState", "billZip",
  "qboTermId", "name", "street", "city", "state", "zip", "propertyManagementCompanyId", "parentCustomerId", "branchBillingMode", "isParent"];
const predicate = (companyId: string, id: string) => and(eq(customers.companyId, companyId), eq(customers.id, id));
export async function markPending(tx: AppTransaction, c: Customer) {
  await tx.update(customers).set({ qboSyncState: "pending_push" }).where(predicate(c.companyId, c.id));
  queueCustomerPush(c.companyId, c.id);
}
export async function guardBranchMode(tx: AppTransaction, companyId: string, id: string, mode: string | undefined) {
  if (mode !== "master") return;
  const linked = await tx.select({ id: customers.id }).from(customers).where(and(
    eq(customers.companyId, companyId), eq(customers.parentCustomerId, id), isNotNull(customers.qboCustomerId)));
  if (linked.length) throw new CustomerSyncError(409, "Branches already exist in QuickBooks; un-link them first.");
}
export function customerEditNeedsPush(before: Customer | undefined, after: Customer) {
  const activated = after.status === "active" && before?.status !== "active";
  const billingChanged = !!before && billingColumns.some(k => !equal(before[k], after[k]));
  return activated || (billingChanged && !!(after.qboCustomerId || after.qboSyncState === "pending_push"));
}
export async function afterCustomerEdit(tx: AppTransaction, before: Customer | undefined, after: Customer) {
  if (customerEditNeedsPush(before, after))
    await markPending(tx, after);
  if (before && (before.branchBillingMode !== after.branchBillingMode || before.qboCustomerId !== after.qboCustomerId)) {
    const branches = await tx.select().from(customers).where(and(eq(customers.companyId, after.companyId),
      eq(customers.parentCustomerId, after.id))).for("update");
    for (const branch of branches) {
      if (after.branchBillingMode === "master") {
        await tx.update(customers).set({ qboSyncState: "via_parent" }).where(predicate(after.companyId, branch.id));
      } else if (branch.qboCustomerId || branch.status === "active") {
        const [unlinked] = await tx.select({ id: qboCustomerReviews.id }).from(qboCustomerReviews).where(and(
          eq(qboCustomerReviews.companyId, after.companyId), eq(qboCustomerReviews.customerId, branch.id),
          eq(qboCustomerReviews.kind, "qbo_removed"), eq(qboCustomerReviews.resolution, "unlink")));
        if (!unlinked || branch.qboCustomerId) await markPending(tx, branch);
      }
    }
  }
}
export async function writeCustomer(tx: AppTransaction, id: string, companyId: string,
  updates: Partial<InsertCustomer>, expectedUpdatedAt?: Date) {
  const before = await lockedCustomer(tx, companyId, id);
  if (!before) return undefined;
  await validateAccountManagerWrite(tx, companyId, { ...before, ...updates }, updates);
  if (expectedUpdatedAt && Math.abs(before.updatedAt.getTime() - expectedUpdatedAt.getTime()) > 1000)
    return { conflict: true as const, current: before };
  let newParent: Customer | undefined;
  if (updates.parentCustomerId) {
    newParent = await lockedCustomer(tx, companyId, updates.parentCustomerId);
    const children = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.parentCustomerId, id))).limit(1);
    if (!newParent || newParent.id === id || newParent.parentCustomerId || children.length ||
      (updates.isParent ?? before.isParent) === "true")
      throw new CustomerSyncError(400, "Invalid parent customer");
    if (before.qboCustomerId && newParent.branchBillingMode === "master")
      throw new CustomerSyncError(409, "Branches already exist in QuickBooks; un-link them first.");
    newParent = { ...newParent, isParent: "true" };
  }
  // Every writer using this shared PATCH boundary validates before any mutation
  // or outbound scheduling, regardless of the screen that requested activation.
  if (before.status === "prospect" && updates.status === "active")
    await assertActivationComplete({ ...before, ...updates } as Customer, {
      companyId,
      getCustomerById: async id => id === newParent?.id ? newParent :
        (await tx.select().from(customers).where(predicate(companyId, id)))[0],
      getPropertyManagementCompanyById: async id => (await tx.select().from(propertyManagementCompanies)
        .where(and(eq(propertyManagementCompanies.companyId, companyId), eq(propertyManagementCompanies.id, id))))[0],
    });
  if (updates.branchBillingMode !== before.branchBillingMode) await guardBranchMode(tx, companyId, id, updates.branchBillingMode);
  if (newParent) await tx.update(customers).set({ isParent: "true", updatedAt: new Date() })
    .where(predicate(companyId, newParent.id));
  const [after] = await tx.update(customers).set({ ...updates, updatedAt: new Date() } as Partial<Customer>)
    .where(predicate(companyId, id)).returning();
  if (Object.hasOwn(updates, "parentCustomerId") && before.parentCustomerId && before.parentCustomerId !== after.parentCustomerId) {
    const siblings = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.parentCustomerId, before.parentCustomerId))).limit(1);
    if (!siblings.length) await tx.update(customers).set({ isParent: "false", updatedAt: new Date() })
      .where(predicate(companyId, before.parentCustomerId));
  }
  await afterCustomerEdit(tx, before, after);
  return (await tx.select().from(customers).where(predicate(companyId, id)))[0];
}
