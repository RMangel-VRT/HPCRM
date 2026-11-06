/** Live, read-only resolution context. Identity belongs to users; eligibility to membership. */
export interface AccountManager {
  id: string;
  name: string;
}
export interface AccountManagerCustomer {
  id: string;
  companyId: string;
  parentCustomerId?: string | null;
  accountManagerId?: string | null;
}
export interface AccountManagerContext {
  companyId: string;
  customers: ReadonlyMap<string, AccountManagerCustomer>;
  /** Only active account_manager memberships in this company. */
  managers: ReadonlyMap<string, AccountManager>;
}

/** Branches always use the same-company parent's value, even if an old own ID exists. */
export function resolveAccountManager(customer: AccountManagerCustomer, context: AccountManagerContext): AccountManager | null {
  if (customer.companyId !== context.companyId) return null;
  const owner = customer.parentCustomerId ? context.customers.get(customer.parentCustomerId) : customer;
  if (!owner || owner.companyId !== context.companyId || owner.parentCustomerId) return null;
  return owner.accountManagerId ? context.managers.get(owner.accountManagerId) ?? null : null;
}
