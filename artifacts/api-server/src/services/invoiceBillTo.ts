import { and, eq } from "drizzle-orm";
import { customers, propertyManagementCompanies, qboConnections, qboCustomerCache, type Customer } from "@workspace/db";
import type { AppTransaction } from "../db";
import { billsThroughParent, resolveBillTo } from "./customerBilling";

/** Explicit legacy exception: remote billing mirror is read only until the
 * company completes initial reconciliation. Afterwards billing is live CRM-owned. */
export async function invoiceBillTo(tx: AppTransaction, companyId: string, customer: Customer) {
  const [conn] = await tx.select({ baselineAt: qboConnections.customerBaselineAt }).from(qboConnections).where(eq(qboConnections.companyId, companyId));
  if (!conn?.baselineAt) {
    const [cache] = customer.qboCustomerId ? await tx.select().from(qboCustomerCache)
      .where(and(eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, customer.qboCustomerId))) : [];
    return { name: customer.name, address: cache?.billAddrLine1
      ? [cache.billAddrLine1, [cache.billAddrCity, cache.billAddrCountrySubDivisionCode, cache.billAddrPostalCode].filter(Boolean).join(" ")].filter(Boolean).join("\n")
      : propertyAddress(customer) };
  }
  const getCustomer = async (id: string) => (await tx.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, id))))[0];
  const resolved = await resolveBillTo(customer, {
    companyId, getCustomerById: getCustomer,
    getPropertyManagementCompanyById: async id => (await tx.select().from(propertyManagementCompanies)
      .where(and(eq(propertyManagementCompanies.companyId, companyId), eq(propertyManagementCompanies.id, id))))[0],
  });
  if (!("problem" in resolved)) return { name: resolved.name, address: resolved.lines.join("\n") };
  if (resolved.problem !== "BILL_TO_INCOMPLETE") throw new Error("Unexpected bill-to resolution problem");
  const parent = customer.parentCustomerId ? await getCustomer(customer.parentCustomerId) : undefined;
  const owner = billsThroughParent(customer, parent) ? parent! : customer;
  return { name: owner.billingName ?? owner.name, address: propertyAddress(owner) };
}
function propertyAddress(c: Customer) {
  return [c.street, [c.city, c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join("\n");
}
