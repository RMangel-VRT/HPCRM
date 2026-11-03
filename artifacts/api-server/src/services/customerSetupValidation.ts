import type { Customer } from "@workspace/db";
import { billsThroughParent, resolveBillTo, type BillingContext } from "./customerBilling";
import { validateDisplayName } from "./qboCustomerMap";

export class ActivationIncomplete extends Error {
  status = 400;
  code = "ACTIVATION_INCOMPLETE";
  constructor(public missingFields: string[]) { super("ACTIVATION_INCOMPLETE"); }
}

/** Validate the effective record, including live parent/directory billing facts. */
export async function setupMissingFields(customer: Customer, ctx: BillingContext): Promise<string[]> {
  const missing: string[] = [];
  for (const key of ["street", "city", "state", "zip"] as const)
    if (!customer[key]?.trim()) missing.push(key);
  const parent = customer.parentCustomerId ? await ctx.getCustomerById(customer.parentCustomerId, ctx.companyId) : undefined;
  const billing = billsThroughParent(customer, parent) ? parent as Customer : customer;
  try { validateDisplayName(billing.billingName); } catch { missing.push("billingName"); }
  if (!billing.billingEmails?.length || billing.billingEmails.join(",").length > 100 ||
    billing.billingEmails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) missing.push("billingEmails");
  if ("problem" in await resolveBillTo(customer, ctx)) missing.push("billTo");
  return missing;
}

export async function assertActivationComplete(customer: Customer, ctx: BillingContext) {
  const missing = await setupMissingFields(customer, ctx);
  if (missing.length) throw new ActivationIncomplete(missing);
}
