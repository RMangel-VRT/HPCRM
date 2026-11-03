import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertCustomerSchema } from "@workspace/db";
import { pickProvided } from "../lib/patchBody";
import { billingInputProblem, protectedBillingWrite } from "../services/customerBillingInput";

// Execute the actual route registrations without unrelated startup jobs.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.post("/api/customers",');
const end = source.indexOf('  app.delete("/api/customers/:id",', start);
if (start < 0 || end < 0) throw new Error("Customer handlers not found");
const mount = new Function("app", "storage", "insertCustomerSchema", "pickProvided",
  "billingInputProblem", "protectedBillingWrite", "storageBillingContext",
  transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code);
const property = { name: "Property", street: "10 Work St", city: "Denver", state: "CO", zip: "80202" };
let current: any;
let authenticated: boolean, role: string;
let app: ReturnType<typeof express>;
const storage = {
  createCustomer: vi.fn(), updateCustomer: vi.fn(), getCustomerById: vi.fn(),
  getPropertyManagementCompanyById: vi.fn(), getPropertyManagerById: vi.fn(),
  getContactsByCustomerId: vi.fn(), getChildCustomers: vi.fn(),
};
const post = (data: object) => request(app).post("/api/customers").send(data);
const patch = (data: object) => request(app).patch("/api/customers/customer").send(data);
beforeEach(() => {
  vi.resetAllMocks();
  authenticated = true; role = "admin";
  current = { ...property, id: "customer", companyId: "company", billToMode: "property", billingEmails: ["keep@example.com"],
    billingName: "Keep Name", branchBillingMode: "separate", status: "prospect", tags: ["keep"], isParent: "false", propertyManagerId: null };
  storage.getCustomerById.mockImplementation(async (_id, company) => current?.companyId === company ? current : undefined);
  storage.getPropertyManagementCompanyById.mockImplementation(async (_id, company) => ({ id: "pm", companyId: company }));
  storage.createCustomer.mockImplementation(async data => ({ ...data, id: "new" }));
  storage.updateCustomer.mockImplementation(async (_id, _company, updates) => ({ ...current, ...updates }));
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as any;
    req.user = { activeCompanyId: "company", activeRole: role } as any;
    req.log = { warn: vi.fn() } as any; next();
  });
  mount(app, storage, insertCustomerSchema, pickProvided, billingInputProblem, protectedBillingWrite,
    (companyId: string) => ({ companyId, ...storage }));
});
describe("customer billing HTTP writes", () => {
  it.each(["8012", "CO 80123", "T2P 1J9", "abcde", "80123-456", "80123 4567"])(
    "rejects newly supplied invalid ZIP %s without blocking unchanged legacy values", async zip => {
      expect((await post({ ...property, zip })).status).toBe(400);
      expect((await patch({ zip })).status).toBe(400);
      expect((await post({ ...property, billZip: zip })).status).toBe(400);
      expect((await patch({ billZip: zip })).status).toBe(400);
      Object.assign(current, { zip, billZip: zip });
      expect((await patch({ name: "Legacy edit" })).status).toBe(200);
      expect((await patch({ zip, billZip: zip })).status).toBe(200);
      expect((await patch({ zip: "80202", billZip: "80202-1234" })).status).toBe(200);
    });
  it.each(["80123", "801234567", "80123-4567"])("accepts valid ZIP %s on create and PATCH", async zip => {
    expect((await post({ ...property, zip, billZip: zip })).status).toBe(200);
    expect((await patch({ zip, billZip: zip })).status).toBe(200);
  });
  it("does not require optional service or unused billing addresses", async () => {
    expect((await post({ ...property, zip: "", billZip: null })).status).toBe(200);
    expect((await patch({ zip: "", billZip: null })).status).toBe(200);
  });
  it("rejects a queued billing edit from the previous company before any owner write", async () => {
    const result = await request(app).patch("/api/customers/customer")
      .set("X-Company-Id", "previous-company").send({ billingName: "Wrong company" });
    expect(result.status).toBe(409);
    expect(storage.updateCustomer).not.toHaveBeenCalled();
    expect(storage.getCustomerById).not.toHaveBeenCalled();
  });
  it.each(["qboCustomerId", "qboDisplayName", "qboSyncedAt", "qboSyncToken", "qboBaseline", "qboSyncState", "qboLastError", "qboPushedAt"])(
    "rejects protected %s in camel and snake case on create and PATCH", async key => {
      for (const spelling of [key, key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)]) {
        expect((await post({ ...property, [spelling]: null })).status).toBe(400);
        expect((await patch({ [spelling]: null })).status).toBe(400);
      }
      expect(storage.createCustomer).not.toHaveBeenCalled();
      expect(storage.updateCustomer).not.toHaveBeenCalled();
    });
  it("persists every owner field and keeps sync metadata out of insert inputs", async () => {
    const billing = {
      billingName: "Accounts", billingCompanyName: "Company", billingContactName: "Mary Smith",
      billingEmails: ["ap@example.com"], billingPhone: "3035550101", billingMobile: "7205550102",
      billToMode: "custom", billStreet: "1 Bill St", billStreet2: "Suite 2", billCity: "Boulder",
      billState: "CO", billZip: "80301", qboTermId: "3", branchBillingMode: "separate",
    };
    const response = await post({ ...property, ...billing, companyId: "foreign" });
    expect(response.status).toBe(200);
    expect(storage.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ ...billing, companyId: "company" }));
    const parsed = insertCustomerSchema.parse({ ...property, companyId: "company", qboSyncState: "in_sync" });
    expect(parsed).not.toHaveProperty("qboSyncState");
  });
  it("accepts unchanged legacy form input and applies defaults on create only", async () => {
    const response = await post({ ...property, complexityScore: "", acres: "10", customerType: "hoa" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ billToMode: "property", billingEmails: [], branchBillingMode: "master", acres: "10", customerType: "hoa" });
    const changed = await patch({ name: "Changed" });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ status: "prospect", tags: ["keep"], billingEmails: ["keep@example.com"], branchBillingMode: "separate", billingName: "Keep Name" });
    expect(storage.updateCustomer).toHaveBeenLastCalledWith("customer", "company", { name: "Changed" }, undefined);
  });
  it.each([{ billingEmails: ["bad"] }, { billToMode: "bad" }, { branchBillingMode: "bad" },
    { billToMode: "custom" }, { billToMode: "management_company" }])("rejects invalid billing input %j", async value => {
    expect((await post({ ...property, ...value })).status).toBe(400);
    expect((await patch(value)).status).toBe(400);
  });
  it("validates custom PATCH transitions against the merged record and permits clearing only after switching mode", async () => {
    Object.assign(current, { billStreet: "1 Bill St", billCity: "Denver", billState: "CO", billZip: "80202" });
    expect((await patch({ billToMode: "custom" })).status).toBe(200);
    current.billToMode = "custom";
    expect((await patch({ billCity: " " })).status).toBe(400);
    expect((await patch({ name: "Renamed" })).status).toBe(200);
    expect((await patch({ billToMode: "property", billStreet: null, billingEmails: [], billingName: null })).status).toBe(200);
    expect(storage.updateCustomer).toHaveBeenLastCalledWith("customer", "company",
      { billToMode: "property", billStreet: null, billingEmails: [], billingName: null }, undefined);
  });
  it("requires a same-company management association and cannot clear it in management mode", async () => {
    expect((await patch({ billToMode: "management_company", propertyManagementCompanyId: "pm" })).status).toBe(200);
    current.billToMode = "management_company"; current.propertyManagementCompanyId = "pm";
    expect((await patch({ propertyManagementCompanyId: null })).status).toBe(400);
    storage.getPropertyManagementCompanyById.mockResolvedValue({ companyId: "foreign" });
    expect((await post({ ...property, billToMode: "management_company", propertyManagementCompanyId: "pm" })).status).toBe(400);
    expect((await patch({ name: "New Name" })).status).toBe(400);
  });
  it("retains auth, permissions, company scoping and optimistic conflict responses", async () => {
    authenticated = false; expect((await patch({ name: "New" })).status).toBe(401);
    authenticated = true; role = "field"; expect((await post(property)).status).toBe(403);
    role = "office"; current.companyId = "foreign";
    expect((await patch({ name: "New" })).status).toBe(404);
    expect(storage.updateCustomer).not.toHaveBeenCalled();
    current.companyId = "company";
    storage.updateCustomer.mockResolvedValue({ conflict: true, current });
    expect((await patch({ name: "New", expectedUpdatedAt: "2026-11-03T10:00:00Z" })).status).toBe(409);
    expect(storage.updateCustomer).toHaveBeenCalledWith("customer", "company", { name: "New" }, new Date("2026-11-03T10:00:00Z"));
  });
});
