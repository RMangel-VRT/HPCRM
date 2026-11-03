import { describe, it, expect, vi } from "vitest";
import { resolveBillTo, billsThroughParent, type BillingContext } from "./customerBilling";
import { billingInputProblem } from "./customerBillingInput";
import type { Customer } from "@workspace/db";

export const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: "customer", companyId: "company", name: "Property", street: "100 Work St",
  city: "Denver", state: "CO", zip: "80202", billingName: null,
  billToMode: "property", billStreet: null, billStreet2: null, billCity: null,
  billState: null, billZip: null, billingCompanyName: null, billingContactName: null,
  billingEmails: [], billingPhone: null, billingMobile: null, qboTermId: null,
  branchBillingMode: "master", parentCustomerId: null, isParent: "false",
  propertyManagementCompanyId: null, qboCustomerId: null, status: "active",
  ...overrides,
} as Customer);
const pm = { id: "pm", companyId: "company", name: "Management", street: "20 Bill St", city: "Boulder", state: "CO", zip: "80301" };
const context = (): BillingContext => ({
  companyId: "company", getCustomerById: vi.fn().mockResolvedValue(undefined),
  getPropertyManagementCompanyById: vi.fn().mockImplementation(async () => ({ ...pm })),
});
describe("live company-scoped bill-to", () => {
  it("validates supplied ZIP changes in shared input checks, preserving legacy/empty rules", async () => {
    const previous = { zip: "bad", billZip: "legacy", billToMode: "property" };
    expect(await billingInputProblem(previous, context())).toMatch(/Service ZIP/);
    expect(await billingInputProblem(previous, context(), { provided: {}, previous })).toBeNull();
    expect(await billingInputProblem(previous, context(), { provided: previous, previous })).toBeNull();
    expect(await billingInputProblem({ ...previous, billZip: "new bad" }, context(),
      { provided: { billZip: "new bad" }, previous })).toMatch(/Billing ZIP/);
    expect(await billingInputProblem({ zip: "", billZip: null }, context())).toBeNull();
  });
  it("uses property and custom addresses, including optional line 2", async () => {
    expect(await resolveBillTo(customer(), context())).toMatchObject({ name: "Property", street: "100 Work St", street2: null });
    expect(await resolveBillTo(customer({ billToMode: "custom", billingName: "Accounts",
      billStreet: "1 Bill St", billStreet2: "Suite 2", billCity: "Boulder", billState: "CO", billZip: "80301" }), context()))
      .toMatchObject({ name: "Accounts", street: "1 Bill St", street2: "Suite 2", lines: ["1 Bill St", "Suite 2", "Boulder, CO 80301"] });
  });
  it.each(["property", "custom", "management_company"] as const)("rejects incomplete %s addresses", async billToMode => {
    expect(await resolveBillTo(customer({ billToMode, street: " " }), context())).toEqual({ problem: "BILL_TO_INCOMPLETE" });
  });
  it("reads management addresses live and includes care-of as the first line", async () => {
    const ctx = context(), c = customer({ billToMode: "management_company", propertyManagementCompanyId: "pm" });
    expect(await resolveBillTo(c, ctx)).toMatchObject({ street: "c/o Management", street2: "20 Bill St", lines: ["c/o Management", "20 Bill St", "Boulder, CO 80301"] });
    vi.mocked(ctx.getPropertyManagementCompanyById).mockResolvedValue({ ...pm, street: "30 New St" });
    expect(await resolveBillTo(c, ctx)).toMatchObject({ street2: "30 New St" });
    expect(c.billStreet).toBeNull();
    expect(ctx.getPropertyManagementCompanyById).toHaveBeenCalledWith("pm", "company");
    vi.mocked(ctx.getPropertyManagementCompanyById).mockResolvedValue({ ...pm, zip: "" });
    expect(await resolveBillTo(c, ctx)).toEqual({ problem: "BILL_TO_INCOMPLETE" });
  });
  it("uses the master parent's name and bill-to, but not for separate mode", async () => {
    const ctx = context(), c = customer({ parentCustomerId: "parent" });
    const parent = customer({ id: "parent", isParent: "true", billingName: "Master Accounts", street: "20 Parent St" });
    vi.mocked(ctx.getCustomerById).mockResolvedValue(parent);
    expect(billsThroughParent(c, parent)).toBe(true);
    expect(await resolveBillTo(c, ctx)).toMatchObject({ name: "Master Accounts", street: "20 Parent St" });
    vi.mocked(ctx.getCustomerById).mockResolvedValue({ ...parent, branchBillingMode: "separate" });
    expect(await resolveBillTo(c, ctx)).toMatchObject({ name: "Property", street: "100 Work St" });
  });
  it("never resolves a customer, parent, or management company across company boundaries", async () => {
    const ctx = context();
    expect(await resolveBillTo(customer({ companyId: "foreign" }), ctx)).toEqual({ problem: "BILL_TO_INCOMPLETE" });
    expect(ctx.getCustomerById).not.toHaveBeenCalled();
    vi.mocked(ctx.getCustomerById).mockResolvedValue(customer({ id: "parent", companyId: "foreign", isParent: "true" }));
    expect(await resolveBillTo(customer({ parentCustomerId: "parent" }), ctx)).toEqual({ problem: "BILL_TO_INCOMPLETE" });
    vi.mocked(ctx.getPropertyManagementCompanyById).mockResolvedValue({ ...pm, companyId: "foreign" });
    const c = customer({ billToMode: "management_company", propertyManagementCompanyId: "pm" });
    expect(await resolveBillTo(c, ctx)).toEqual({ problem: "BILL_TO_INCOMPLETE" });
    expect(await billingInputProblem(c, ctx)).toBe("BILL_TO_INCOMPLETE");
  });
});
