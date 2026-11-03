import type { BillingContext } from "./customerBilling";

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
  billToMode?: string; billStreet?: string | null; billCity?: string | null;
  billState?: string | null; billZip?: string | null; propertyManagementCompanyId?: string | null;
};
/** Validate the effective merged record, not a default-filled partial insert. */
export async function billingInputProblem(value: BillingInput, ctx: BillingContext): Promise<string | null> {
  if (value.billToMode === "custom" &&
    ![value.billStreet, value.billCity, value.billState, value.billZip].every(v => !!v?.trim())) return "BILL_TO_INCOMPLETE";
  if (value.billToMode === "management_company") {
    if (!value.propertyManagementCompanyId) return "BILL_TO_INCOMPLETE";
    const pm = await ctx.getPropertyManagementCompanyById(value.propertyManagementCompanyId, ctx.companyId);
    if (!pm || pm.companyId !== ctx.companyId) return "BILL_TO_INCOMPLETE";
  }
  return null;
}
