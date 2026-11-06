import { and, eq, inArray, sql } from "drizzle-orm";
import { companyUsers, customers, users } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { CustomerSyncError } from "./qboCustomerSync";
import { resolveAccountManager, type AccountManagerCustomer } from "../../../../lib/db/src/accountManager";

export { resolveAccountManager };
export const ACCOUNT_MANAGER_INVALID = "Account manager must be an active Account manager in this company.";

/** Two bulk queries; never one membership/parent query per customer. */
export async function loadAccountManagerContext(companyId: string, connection: AppTransaction | typeof db = db) {
  const [properties, eligible] = await Promise.all([
    connection.select({ id: customers.id, companyId: customers.companyId,
      parentCustomerId: customers.parentCustomerId, accountManagerId: customers.accountManagerId })
      .from(customers).where(eq(customers.companyId, companyId)),
    connection.select({ id: users.id, name: users.name }).from(companyUsers)
      .innerJoin(users, eq(users.id, companyUsers.userId)).where(and(
        eq(companyUsers.companyId, companyId), eq(companyUsers.status, "active"),
        eq(companyUsers.role, "account_manager"))),
  ]);
  return { companyId, customers: new Map(properties.map(c => [c.id, c])),
    managers: new Map(eligible.map(m => [m.id, m])) };
}

/** Omission preserves; explicit null clears. Any provided branch value is forbidden. */
export async function validateAccountManagerWrite(tx: AppTransaction, companyId: string,
  customer: Pick<AccountManagerCustomer, "parentCustomerId">, updates: object) {
  if (!Object.hasOwn(updates, "accountManagerId")) return;
  if (customer.parentCustomerId) throw new CustomerSyncError(422, "Account manager is set on the parent customer.");
  const id = (updates as { accountManagerId?: string | null }).accountManagerId;
  if (id === null) return;
  const [member] = typeof id === "string" ? await tx.select({ id: companyUsers.id }).from(companyUsers)
    .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, id),
      eq(companyUsers.status, "active"), eq(companyUsers.role, "account_manager"))).for("share") : [];
  if (!member) throw new CustomerSyncError(422, ACCOUNT_MANAGER_INVALID);
}

/** One transaction, sorted locks, validate everything before writing anything. No QBO writer. */
export async function bulkAssignAccountManager(companyId: string, customerIds: string[], accountManagerId: string | null) {
  return db.transaction(async tx => {
    const ids = [...new Set(customerIds)].sort();
    const rows = await tx.select().from(customers).where(and(eq(customers.companyId, companyId),
      inArray(customers.id, ids))).orderBy(customers.id).for("update");
    if (rows.length !== ids.length) throw new CustomerSyncError(422, "Some customers are unavailable in this company.");
    if (rows.some(c => c.parentCustomerId)) throw new CustomerSyncError(422, "Account manager is set on the parent customer.");
    await validateAccountManagerWrite(tx, companyId, {}, { accountManagerId });
    const changed = await tx.update(customers).set({ accountManagerId, updatedAt: new Date() })
      .where(and(eq(customers.companyId, companyId), inArray(customers.id, ids),
        sql`${customers.accountManagerId} IS DISTINCT FROM ${accountManagerId}`)).returning({ id: customers.id });
    return { changedCount: changed.length };
  });
}
