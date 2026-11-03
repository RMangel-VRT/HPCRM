import type { BillingContext } from "./customerBilling";
import { validCustomerZip } from "./customerZip";

const PROTECTED = [
  "qboCustomerId", "qboDisplayName", "qboSyncedAt", "qboSyncToken", "qboBaseline",
  "qboSyncState", "qboLastError", "qboPushedAt",
];
/** Check raw keys before Zod strips them. qboTermId is an editable billing fact. */
export function protectedBillingWrite(body: Record<string, unknown>): boolean {
  return PROTECTED.some(key => Object.hasOwn(body, key) ||
    Object.hasOwn(body, key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)));
}
type BillingInput = {
  zip?: string | null;
  billToMode?: string; billStreet?: string | null; billCity?: string | null;
  billState?: string | null; billZip?: string | null; propertyManagementCompanyId?: string | null;
};
/** Validate the effective merged record, not a default-filled partial insert. */
export async function billingInputProblem(value: BillingInput, ctx: BillingContext,
  edit?: { provided: BillingInput; previous: BillingInput }): Promise<string | null> {
  for (const key of ["zip", "billZip"] as const) {
    const changed = !edit || (Object.hasOwn(edit.provided, key) && edit.provided[key] !== edit.previous[key]);
    if (changed && !validCustomerZip(value[key]))
      return `${key === "zip" ? "Service" : "Billing"} ZIP must be five digits or nine digits (ZIP+4)`;
  }
  if (value.billToMode === "custom" &&
    ![value.billStreet, value.billCity, value.billState, value.billZip].every(v => !!v?.trim())) return "BILL_TO_INCOMPLETE";
  if (value.billToMode === "management_company") {
    if (!value.propertyManagementCompanyId) return "BILL_TO_INCOMPLETE";
    const pm = await ctx.getPropertyManagementCompanyById(value.propertyManagementCompanyId, ctx.companyId);
    if (!pm || pm.companyId !== ctx.companyId) return "BILL_TO_INCOMPLETE";
  }
  return null;
}
