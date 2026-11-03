import type { Customer, PropertyManagementCompany } from "@workspace/db";

export type BillingCustomer = Pick<Customer,
  "id" | "companyId" | "name" | "street" | "city" | "state" | "zip" |
  "billingName" | "billToMode" | "billStreet" | "billStreet2" | "billCity" |
  "billState" | "billZip" | "parentCustomerId" | "isParent" | "branchBillingMode" |
  "propertyManagementCompanyId">;
export type Addr = { street: string | null; street2: string | null; city: string | null; state: string | null; zip: string | null };
export type BillTo = Addr & { name: string; lines: string[] };
export type BillingProblem = { problem: "BILL_TO_INCOMPLETE" };
export interface BillingContext {
  companyId: string;
  getCustomerById(id: string, companyId: string): Promise<BillingCustomer | undefined>;
  getPropertyManagementCompanyById(id: string, companyId: string): Promise<Pick<PropertyManagementCompany, "id" | "companyId" | "name" | "street" | "city" | "state" | "zip"> | undefined>;
}

export function billsThroughParent(customer: BillingCustomer, parent?: BillingCustomer): boolean {
  return !!parent && customer.companyId === parent.companyId &&
    customer.parentCustomerId === parent.id && parent.isParent === "true" &&
    parent.branchBillingMode === "master";
}

const clean = (v: string | null | undefined) => v?.trim() || null;
export function completeAddress(addr: Addr): boolean {
  return [addr.street, addr.city, addr.state, addr.zip].every(v => !!clean(v));
}

/** Read live, company-scoped directory facts. Never persist a management-company copy. */
export async function resolveBillTo(customer: BillingCustomer, ctx: BillingContext): Promise<BillTo | BillingProblem> {
  const incomplete: BillingProblem = { problem: "BILL_TO_INCOMPLETE" };
  if (customer.companyId !== ctx.companyId) return incomplete;
  if (customer.parentCustomerId) {
    const parent = await ctx.getCustomerById(customer.parentCustomerId, ctx.companyId);
    if (!parent || parent.companyId !== ctx.companyId || parent.parentCustomerId) return incomplete;
    if (billsThroughParent(customer, parent)) return resolveBillTo(parent, ctx);
  }
  let addr: Addr;
  if (customer.billToMode === "management_company") {
    if (!customer.propertyManagementCompanyId) return incomplete;
    const pm = await ctx.getPropertyManagementCompanyById(customer.propertyManagementCompanyId, ctx.companyId);
    if (!pm || pm.companyId !== ctx.companyId) return incomplete;
    // QBO has no care-of field: it is the first address line, followed by the street.
    addr = { street: `c/o ${pm.name}`, street2: clean(pm.street), city: clean(pm.city), state: clean(pm.state), zip: clean(pm.zip) };
    if (!completeAddress({ ...addr, street: clean(pm.street) })) return incomplete;
  } else if (customer.billToMode === "custom") {
    addr = { street: clean(customer.billStreet), street2: clean(customer.billStreet2), city: clean(customer.billCity), state: clean(customer.billState), zip: clean(customer.billZip) };
  } else {
    addr = { street: clean(customer.street), street2: null, city: clean(customer.city), state: clean(customer.state), zip: clean(customer.zip) };
  }
  if (!completeAddress(addr)) return incomplete;
  return {
    ...addr, name: customer.billingName ?? customer.name,
    lines: [addr.street, addr.street2, `${addr.city}, ${addr.state} ${addr.zip}`].filter((v): v is string => !!v),
  };
}
