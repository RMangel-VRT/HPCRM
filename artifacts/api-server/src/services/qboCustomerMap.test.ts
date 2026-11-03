import { describe, it, expect } from "vitest";
import { crmToQboFields, qboToFields, normalize, diffFields, toQboPayload, validateDisplayName, type QboCustomerFields } from "./qboCustomerMap";
import type { Customer } from "@workspace/db";
import { resolveBillTo } from "./customerBilling";

const c = {
  id: "c", companyId: "co", name: "Property", billingName: "Accounts", billingCompanyName: "Company",
  billingContactName: "Mary Ann Smith", billingEmails: ["B@example.com", "a@example.com"],
  billingPhone: "(303) 555-0101", billingMobile: "+1 720-555-0102", qboTermId: "3",
  street: "10 Service St", city: "Denver", state: "co", zip: "80202-1234",
  billToMode: "property", parentCustomerId: null, isParent: "false", branchBillingMode: "master", status: "active",
} as Customer;
const billTo = { name: "Accounts", street: "20 Billing St", street2: "Suite 1", city: "Denver", state: "CO", zip: "80202", lines: [] };
const fields = () => crmToQboFields(c, billTo);
describe("pure QuickBooks field map", () => {
  it("round-trips CRM → payload → parser → canonical values", () => {
    const f = fields(), payload = toQboPayload(f, { create: true });
    expect(payload).toMatchObject({ PreferredDeliveryMethod: "None", GivenName: "Mary Ann", FamilyName: "Smith" });
    expect(normalize(qboToFields(payload))).toEqual(normalize(f));
    expect(payload.ShipAddr).not.toEqual(payload.BillAddr);
  });
  it("normalizes whitespace, nulls, emails, phones, state and both ZIP lengths", () => {
    const f = normalize({ ...fields(), displayName: "  Some  \t Account ", companyName: " ",
      emails: [" B@example.com ", "a@EXAMPLE.com", "b@example.com", ""], phone: "(303) 555-0101",
      mobile: "", billAddr: { ...billTo, state: " co ", zip: "80202-1234" } });
    expect(f).toMatchObject({ displayName: "Some Account", companyName: null, emails: ["a@example.com", "b@example.com"],
      phone: "3035550101", mobile: null, billAddr: { state: "CO", zip: "802021234" } });
    expect(f.billAddr).not.toHaveProperty("name");
    expect(normalize({ ...fields(), billAddr: { street: "", street2: null, city: "", state: "", zip: "" } }).billAddr).toBeNull();
    expect(diffFields(fields(), { ...fields(), phone: "3035550101", emails: ["a@example.com", "b@example.com"], shipAddr: { ...fields().shipAddr!, state: "CO", zip: "802021234" } })).toEqual([]);
  });
  it("parses semicolon/comma email lists, references, flags, token and timestamps", () => {
    expect(qboToFields({ Id: "42", SyncToken: "0", DisplayName: " Name ", GivenName: "Mary Ann", FamilyName: "Smith",
      PrimaryEmailAddr: { Address: "a@e.com; b@e.com,c@e.com" }, ParentRef: { value: "7" }, Job: true,
      BillWithParent: true, Active: false, MetaData: { CreateTime: "created", LastUpdatedTime: "updated" } }))
      .toMatchObject({ id: "42", syncToken: "0", createdAt: "created", updatedAt: "updated", contactName: "Mary Ann Smith",
        emails: ["a@e.com", "b@e.com", "c@e.com"], parentQboId: "7", job: true, billWithParent: true, active: false });
  });
  it("uses last-space contact splitting, including single names and clears", () => {
    for (const [contactName, GivenName, FamilyName] of [["Cher", "Cher", ""], [null, "", ""]]) {
      expect(toQboPayload({ ...fields(), contactName } as QboCustomerFields,
        { create: false, id: "1", syncToken: "0", onlyKeys: ["contactName"] }))
        .toEqual({ sparse: true, Id: "1", SyncToken: "0", GivenName, FamilyName });
    }
  });
  it("sends only changed requested keys, whole addresses and explicit clears", () => {
    const changed = { ...fields(), phone: null, billAddr: null, emails: [], termId: null };
    const keys = diffFields(fields(), changed);
    expect(keys.sort()).toEqual(["billAddr", "emails", "phone", "termId"]);
    expect(toQboPayload(changed, { create: false, id: "42", syncToken: "2", onlyKeys: keys })).toEqual({
      sparse: true, Id: "42", SyncToken: "2", PrimaryPhone: { FreeFormNumber: "" },
      PrimaryEmailAddr: { Address: "" }, SalesTermRef: { value: "" },
      BillAddr: { Line1: "", Line2: "", City: "", CountrySubDivisionCode: "", PostalCode: "" },
    });
    expect(toQboPayload(fields(), { create: false, id: "42", syncToken: "2", onlyKeys: ["billAddr"] })).toEqual({
      sparse: true, Id: "42", SyncToken: "2",
      BillAddr: { Line1: billTo.street, Line2: billTo.street2, City: billTo.city, CountrySubDivisionCode: billTo.state, PostalCode: billTo.zip },
    });
    expect(toQboPayload(fields(), { create: false, id: "42", syncToken: "2", onlyKeys: [] })).not.toHaveProperty("PreferredDeliveryMethod");
    expect(() => toQboPayload(fields(), { create: false })).toThrow("QBO_UPDATE_IDENTITY_REQUIRED");
    expect(() => toQboPayload(fields(), { create: false, id: "1", syncToken: "0" })).toThrow("QBO_UPDATE_KEYS_REQUIRED");
  });
  it("enforces exact email and display-name limits", () => {
    expect(() => validateDisplayName("x".repeat(100))).not.toThrow();
    for (const name of ["x".repeat(101), "Parent:Child", " "]) expect(() => validateDisplayName(name)).toThrow("DISPLAY_NAME_INVALID");
    expect(() => toQboPayload({ ...fields(), emails: ["x".repeat(100)] }, { create: true })).not.toThrow();
    expect(() => toQboPayload({ ...fields(), emails: ["x".repeat(101)] }, { create: true })).toThrow("EMAILS_TOO_LONG");
  });
  it("rejects master branches and uses separate-parent reference without billing with parent", async () => {
    const parent = { ...c, id: "parent", isParent: "true", branchBillingMode: "master", qboCustomerId: "qbo-parent" } as Customer;
    const branch = { ...c, parentCustomerId: "parent" };
    expect(() => crmToQboFields(branch, billTo, parent)).toThrow("BILLS_THROUGH_PARENT");
    expect(() => crmToQboFields(branch, billTo, { ...parent, companyId: "foreign" })).toThrow("PARENT_INVALID");
    const f = crmToQboFields(branch, billTo, { ...parent, branchBillingMode: "separate" });
    expect(toQboPayload(f, { create: true })).toMatchObject({ ParentRef: { value: "qbo-parent" }, Job: true, BillWithParent: false });
    expect(crmToQboFields({ ...c, billingName: null }, billTo).displayName).toBe(c.name);
    const resolved = await resolveBillTo(branch, { companyId: "co", getCustomerById: async () => parent, getPropertyManagementCompanyById: async () => undefined });
    expect(resolved).toMatchObject({ name: "Accounts", street: parent.street });
  });
});
