import { describe, expect, it } from "vitest";
import { canManuallyInvoice, canSeeBilling, isStrandedEligible } from "./billing";
import { insertTicketSchema } from "@workspace/db";
import { pickProvided } from "./patchBody";

const type = (typeKey: any, requiresInvoicing?: any) => ({ id: typeKey, typeKey, name: "Renamed", requiresInvoicing });
const ready = { statusKey: "ready_for_billing", name: "Renamed Ready" };
describe("membership-based billing and recovery boundaries", () => {
  it.each(["admin", "office"])("allows untagged %s", activeRole => {
    expect(canSeeBilling({ activeRole, activeTags: [] } as any)).toBe(true);
  });
  it.each(["field_manager", "field", "landscape_supervisor", "crew_supervisor"])("allows only tagged %s", activeRole => {
    expect(canSeeBilling({ activeRole, activeTags: ["billing"] } as any)).toBe(true);
    expect(canSeeBilling({ activeRole, activeTags: [] } as any)).toBe(false);
  });
  it("never treats contract Tasks or Invoices as stranded", () => {
    expect(isStrandedEligible({ billingBehavior: "no_invoice" }, type("task", "true"))).toBe(false);
    expect(isStrandedEligible({ billingBehavior: "invoice_required" }, type("invoice", "true"))).toBe(false);
    expect(isStrandedEligible({ billingBehavior: "invoice_required" }, type("task"))).toBe(true);
    expect(isStrandedEligible({ billingBehavior: "internal" }, type("custom", "true"))).toBe(true);
    expect(isStrandedEligible({ billingBehavior: "internal" }, type("project", "false"))).toBe(false);
  });
  it("preserves Project/Estimate Request eligibility and narrowly adds non-Invoice RFB invoice_required recovery", () => {
    expect(canManuallyInvoice({}, type("project"), undefined)).toBe(true);
    expect(canManuallyInvoice({}, type("estimate_request"), undefined)).toBe(true);
    expect(canManuallyInvoice({ billingBehavior: "invoice_required" }, type("task"), ready)).toBe(true);
    expect(canManuallyInvoice({ billingBehavior: "invoice_required" }, type("task"), { statusKey: "work_completed", name: "Ready for Billing" })).toBe(false);
    expect(canManuallyInvoice({ billingBehavior: "no_invoice" }, type("task"), ready)).toBe(false);
    expect(canManuallyInvoice({ billingBehavior: "invoice_required" }, type("invoice"), ready)).toBe(false);
  });
  it("keeps invoiceNumber in sparse final-status PATCH and omits defaults", () => {
    const body = { currentStatusId: "final", invoiceNumber: "QB-42" };
    const parsed = insertTicketSchema.partial().parse(body);
    expect(pickProvided(parsed, body)).toEqual(body);
  });
});
