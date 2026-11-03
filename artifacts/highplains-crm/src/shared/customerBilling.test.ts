import { describe, expect, it } from "vitest";
import { insertCustomerSchema } from "./schema";

describe("existing customer form validation", () => {
  const form = { name: "Property", street: "10 Work St", city: "Denver", state: "CO", zip: "80202",
    complexityScore: "", acres: "10", customerType: "hoa", propertyManagementCompanyId: null };
  it("keeps legacy add/edit fields through the real frontend resolver schema", () => {
    const parsed = insertCustomerSchema.omit({ companyId: true }).parse(form);
    expect(parsed).toMatchObject({ ...form, complexityScore: undefined });
    expect(parsed).not.toHaveProperty("billingEmails");
    expect(parsed).not.toHaveProperty("billToMode");
    expect(parsed).not.toHaveProperty("branchBillingMode");
  });
  it("retains billing values on edit and validates new fields", () => {
    const input = { ...form, billingName: "Accounts", billingEmails: ["ap@example.com"], qboTermId: "3",
      billToMode: "custom", billStreet: "Bill St", billStreet2: "Suite 2", billCity: "Denver", billState: "CO", billZip: "80202", branchBillingMode: "separate" };
    expect(insertCustomerSchema.parse(input)).toMatchObject({ ...input, complexityScore: undefined });
    expect(insertCustomerSchema.safeParse({ ...form, billingEmails: ["bad"] }).success).toBe(false);
    expect(insertCustomerSchema.safeParse({ ...form, qboSyncState: "in_sync" }).success).toBe(false);
  });
});
