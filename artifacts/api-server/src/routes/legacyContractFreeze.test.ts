import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contracts, contractServices, contractMonthlyAmounts, contractDocuments, customerRateSheets } from "@workspace/db";

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("../db", () => ({ db: mocks }));
import { rejectLegacyContractWrite, hasFrozenLegacyRows } from "../lib/legacyContractFreeze";

// Same real-handler extraction pattern as billingDetail.test: avoid route-registration bootstrap writes.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const routes = [
  ["post", "/api/customers/:customerId/contracts"],
  ["post", "/api/contracts"],
  ["patch", "/api/contracts/:id"],
  ["delete", "/api/contracts/:id"],
  ["post", "/api/contracts/:contractId/services"],
  ["patch", "/api/contracts/:contractId/services/:serviceId"],
  ["delete", "/api/contracts/:contractId/services/:serviceId"],
  ["put", "/api/contracts/:contractId/monthly-amounts"],
  ["post", "/api/contracts/:contractId/documents/upload-url"],
  ["post", "/api/contracts/:contractId/documents"],
  ["delete", "/api/contracts/:contractId/documents/:docId"],
  ["post", "/api/contract-builder/documents/:id/publish-and-create"],
  ["put", "/api/customers/:customerId/rate-sheet"],
  ["post", "/api/admin/reset-for-setup"],
] as const;
function mount(app: express.Express, method: string, path: string, storage: any) {
  const start = source.indexOf(`  app.${method}("${path}",`);
  const next = source.slice(start + 1).search(/\n  app\.(?:get|post|patch|put|delete)\(/);
  if (start < 0 || next < 0) throw new Error(`Missing handler ${method} ${path}`);
  const code = source.slice(start, start + 1 + next);
  new Function("app", "storage", "rejectLegacyContractWrite", "hasFrozenLegacyRows",
    transformSync(code, { loader: "ts", target: "es2022" }).code)(app, storage, rejectLegacyContractWrite, hasFrozenLegacyRows);
}
let rows: Map<unknown, any[]>;
let joinedRows: Map<unknown, any[]>;
let predicates: Array<{ table: unknown; sql: string; params: unknown[] }>;
let storage: any;
const message = { message: "Contracts are managed in the Contract Center now." };
function app(options: { authenticated?: boolean; role?: string; superadmin?: boolean } = {}) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => options.authenticated ?? true,
      user: { id: "actor", activeCompanyId: "company", activeRole: options.role ?? "admin", isSuperAdminBool: options.superadmin ?? false },
      logout: vi.fn() });
    next();
  });
  for (const [method, path] of routes) mount(instance, method, path, storage);
  mount(instance, "delete", "/api/customers/:id", storage);
  mount(instance, "delete", "/api/admin/companies/:id", storage);
  return instance;
}
beforeEach(() => {
  vi.resetAllMocks();
  rows = new Map(); joinedRows = new Map(); predicates = [];
  mocks.select.mockImplementation(() => ({ from: (table: unknown) => {
    let joined = false;
    const builder = {
    innerJoin: () => { joined = true; return builder; },
    where: (predicate: any) => {
      predicates.push({ table, ...new PgDialect().sqlToQuery(predicate) });
      return { limit: async () => (joined ? joinedRows : rows).get(table) ?? [] };
    },
    };
    return builder;
  } }));
  storage = {
    getCustomerById: vi.fn().mockResolvedValue({ id: "customer", companyId: "company" }),
    getCompanyById: vi.fn().mockResolvedValue({ id: "company" }),
    deleteCustomer: vi.fn(), deleteCompany: vi.fn(), deleteAllUsers: vi.fn(),
    getChildCustomers: vi.fn(), updateCustomer: vi.fn(),
  };
});
function noWrites() {
  for (const key of ["insert", "update", "delete", "execute", "transaction"] as const) expect(mocks[key]).not.toHaveBeenCalled();
  expect(storage.deleteCustomer).not.toHaveBeenCalled();
  expect(storage.deleteCompany).not.toHaveBeenCalled();
  expect(storage.deleteAllUsers).not.toHaveBeenCalled();
  expect(storage.updateCustomer).not.toHaveBeenCalled();
}
describe("legacy entry-point freeze", () => {
  it.each(routes)("admin %s %s rejects before validation, reads, uploads and side effects", async (method, route) => {
    const path = route.replace(/:[^/]+/g, "not-found");
    const response = await (request(app()) as any)[method](path).send({ invalid: "body" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual(message);
    expect(mocks.select).not.toHaveBeenCalled();
    for (const fn of Object.values(storage)) expect(fn).not.toHaveBeenCalled();
    noWrites();
  });
  it.each(routes)("%s %s retains unauthenticated 401 without work", async (method, route) => {
    const response = await (request(app({ authenticated: false })) as any)[method](route.replace(/:[^/]+/g, "id")).send({});
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled(); noWrites();
  });
  it("freeze precedes the old role deny-list", async () => {
    expect((await request(app({ role: "field" })).post("/api/contracts")).body).toEqual(message);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
describe("cascade deletion protection", () => {
  it.each([contracts, customerRateSheets])("rejects customer deletion with a frozen target", async table => {
    rows.set(table, [{ id: "legacy" }]);
    const response = await request(app()).delete("/api/customers/customer");
    expect(response.status).toBe(409); expect(response.body).toEqual(message); noWrites();
    expect(storage.getCustomerById).toHaveBeenCalledWith("customer", "company");
    expect(predicates.every(p => JSON.stringify(p.params) === JSON.stringify(["customer"]))).toBe(true);
    expect(predicates.every(p => !p.sql.includes('"company_id"'))).toBe(true);
    expect(storage.getCustomerById.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
  });
  it("does not probe a missing or foreign customer", async () => {
    storage.getCustomerById.mockResolvedValue(undefined);
    expect((await request(app()).delete("/api/customers/foreign")).status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled(); noWrites();
  });
  it("allows deletion of a customer without legacy rows", async () => {
    expect((await request(app()).delete("/api/customers/customer")).status).toBe(200);
    expect(storage.deleteCustomer).toHaveBeenCalledWith("customer", "company");
  });
  it.each([contracts, customerRateSheets])("protects customer ancestry even when a legacy row has a mismatched company ID", async table => {
    rows.set(table, [{ id: "legacy", companyId: "other", customerId: "customer" }]);
    expect((await request(app()).delete("/api/customers/customer")).body).toEqual(message);
    expect(storage.getCustomerById).toHaveBeenCalledWith("customer", "company");
    noWrites();
  });
  it.each([contracts, contractServices, contractMonthlyAmounts, contractDocuments, customerRateSheets])("rejects company deletion with each legacy target", async table => {
    rows.set(table, [{ id: "legacy" }]);
    const response = await request(app({ superadmin: true })).delete("/api/admin/companies/company");
    expect(response.status).toBe(409); expect(response.body).toEqual(message); noWrites();
    expect(predicates.every(p => JSON.stringify(p.params) === JSON.stringify(["company"]))).toBe(true);
    expect(storage.getCompanyById.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
  });
  it("checks superadmin authorization before company probes", async () => {
    expect((await request(app()).delete("/api/admin/companies/company")).status).toBe(403);
    expect(storage.getCompanyById).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled(); noWrites();
  });
  it("does not probe a nonexistent company", async () => {
    storage.getCompanyById.mockResolvedValue(undefined);
    expect((await request(app({ superadmin: true })).delete("/api/admin/companies/missing")).status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled(); noWrites();
  });
  it("allows company deletion without legacy rows", async () => {
    expect((await request(app({ superadmin: true })).delete("/api/admin/companies/company")).status).toBe(200);
    expect(storage.deleteCompany).toHaveBeenCalledWith("company");
  });
  it.each([contracts, customerRateSheets])("protects company-owned customer cascades with mismatched legacy company IDs", async table => {
    joinedRows.set(table, [{ id: "legacy", companyId: "other" }]);
    const response = await request(app({ superadmin: true })).delete("/api/admin/companies/company");
    expect(response.status).toBe(409); expect(response.body).toEqual(message); noWrites();
    expect(predicates.some(p => p.sql.includes('"customers"."company_id"'))).toBe(true);
  });
  it("checks the authorized target company, not the superadmin's active company", async () => {
    storage.getCompanyById.mockResolvedValue({ id: "other" });
    expect((await request(app({ superadmin: true })).delete("/api/admin/companies/other")).status).toBe(200);
    expect(predicates.every(p => JSON.stringify(p.params) === JSON.stringify(["other"]))).toBe(true);
    expect(storage.deleteCompany).toHaveBeenCalledWith("other");
  });
  it.each(["/api/customers/customer", "/api/admin/companies/company"])("retains unauthenticated 401 for %s", async path => {
    expect((await request(app({ authenticated: false, superadmin: true })).delete(path)).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled(); noWrites();
  });
});
