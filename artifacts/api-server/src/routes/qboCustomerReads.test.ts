import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[], where: vi.fn(), get: vi.fn(), pm: vi.fn(), connection: vi.fn(),
  remote: vi.fn(), enabled: vi.fn(),
}));
vi.mock("../db", () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}));
vi.mock("../storage", () => ({ storage: { getCustomerById: mocks.get,
  getPropertyManagementCompanyById: mocks.pm, getQboConnection: mocks.connection } }));
vi.mock("../services/qboClient", () => ({ qboRequest: mocks.remote, isQboWriteEnabled: mocks.enabled }));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn() } }));
import { customerQboReads, qboCustomerReads } from "./qboCustomerReads";
let company: string;
function app(role = "admin", tags: string[] = [], authenticated = true) {
  const result = express();
  result.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = { id: "u", activeCompanyId: company, activeRole: role, activeTags: tags } as Express.User;
    next();
  });
  result.use("/api/qbo", qboCustomerReads);
  result.use("/api/customers", customerQboReads);
  return result;
}
let sequence = 0;
beforeEach(() => {
  vi.useRealTimers(); vi.clearAllMocks();
  company = `reads-${++sequence}`;
  mocks.where.mockImplementation(() => {
    const value = Promise.resolve(mocks.rows);
    return Object.assign(value, { orderBy: () => value });
  });
  mocks.rows = [];
  mocks.remote.mockResolvedValue({ ok: true, json: async () => ({ QueryResponse: { Term: [{ Id: "1", Name: "Net 30", Active: true }] } }) });
  mocks.connection.mockResolvedValue({ customerBaselineAt: null });
  mocks.enabled.mockResolvedValue(false);
});
describe("terms permissions, company-scoped memory cache and failures", () => {
  it.each([["admin", []], ["office", []], ["field", ["billing"]]])("allows %s %j", async (role, tags) => {
    expect((await request(app(role, tags)).get("/api/qbo/terms")).body).toEqual([{ id: "1", name: "Net 30" }]);
    expect(mocks.remote).toHaveBeenCalledWith(company, "GET", expect.stringContaining("/query?query="));
    expect(decodeURIComponent(mocks.remote.mock.calls[0][2])).toContain("SELECT * FROM Term WHERE Active = true");
  });
  it("rejects unauthenticated, nonbilling and stale-company requests before QuickBooks", async () => {
    expect((await request(app("admin", [], false)).get("/api/qbo/terms")).status).toBe(401);
    expect((await request(app("field")).get("/api/qbo/terms")).status).toBe(403);
    expect((await request(app()).get("/api/qbo/terms").set("X-Company-Id", "other")).status).toBe(409);
    expect(mocks.remote).not.toHaveBeenCalled();
  });
  it("reuses exactly ten minutes per company and refetches after expiry", async () => {
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const api = app();
    await request(api).get("/api/qbo/terms");
    vi.mocked(Date.now).mockReturnValue(now + 599999);
    await request(api).get("/api/qbo/terms");
    expect(mocks.remote).toHaveBeenCalledTimes(1);
    vi.mocked(Date.now).mockReturnValue(now + 600000);
    await request(api).get("/api/qbo/terms");
    expect(mocks.remote).toHaveBeenCalledTimes(2);
    vi.mocked(Date.now).mockRestore();
  });
  it("does not cache failures or return another company's cached terms", async () => {
    const api = app();
    await request(api).get("/api/qbo/terms");
    const first = company; company = "second-" + first;
    mocks.remote.mockRejectedValueOnce(new Error("remote unavailable"));
    expect((await request(api).get("/api/qbo/terms")).status).toBe(502);
    mocks.remote.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResponse: { Term: [{ Id: "2", Name: "Due now" }] } }) });
    expect((await request(api).get("/api/qbo/terms")).body).toEqual([{ id: "2", name: "Due now" }]);
    company = first;
    expect((await request(api).get("/api/qbo/terms")).body).toEqual([{ id: "1", name: "Net 30" }]);
    expect(mocks.remote).toHaveBeenCalledTimes(3);
  });
  it.each([
    { ok: false, json: async () => ({}) },
    { ok: true, json: async () => ({ Fault: {} }) },
  ])("rejects a failed or malformed response and retries cleanly", async response => {
    mocks.remote.mockResolvedValueOnce(response);
    expect((await request(app()).get("/api/qbo/terms")).status).toBe(502);
    expect((await request(app()).get("/api/qbo/terms")).status).toBe(200);
    expect(mocks.remote).toHaveBeenCalledTimes(2);
  });
  it("excludes inactive terms and handles empty query results", async () => {
    mocks.remote.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResponse: { Term: [{ Id: "9", Name: "Old", Active: false }] } }) });
    expect((await request(app()).get("/api/qbo/terms")).body).toEqual([]);
    company += "empty";
    mocks.remote.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResponse: {} }) });
    expect((await request(app()).get("/api/qbo/terms")).body).toEqual([]);
  });
});
describe("stable QuickBooks ID customer lookup", () => {
  it.each(["admin", "office", "field_manager", "chemical_manager"])("permits existing customer viewer %s", async role => {
    mocks.rows = [{ id: "crm" }];
    expect((await request(app(role)).get("/api/customers/by-qbo/123")).body).toEqual({ id: "crm" });
    // Drizzle predicate includes both the session's company and realm-local ID.
    const predicate = mocks.where.mock.calls[0][0];
    const { PgDialect } = await import("drizzle-orm/pg-core");
    expect(new PgDialect().sqlToQuery(predicate).params).toEqual([company, "123"]);
  });
  it("returns 404 without mapping and denies unauthorized viewers/company races", async () => {
    expect((await request(app()).get("/api/customers/by-qbo/123")).status).toBe(404);
    expect((await request(app("field")).get("/api/customers/by-qbo/123")).status).toBe(403);
    expect((await request(app("admin", [], false)).get("/api/customers/by-qbo/123")).status).toBe(401);
    expect((await request(app()).get("/api/customers/by-qbo/123").set("X-Company-Id", "other")).status).toBe(409);
    expect(mocks.where).toHaveBeenCalledTimes(1);
  });
  it("registers the lookup router before the generic customer API route", () => {
    const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    expect(source.indexOf('app.use("/api/customers", customerQboReads)'))
      .toBeLessThan(source.indexOf('app.get("/api/customers/:id"'));
  });
});
describe("card read projection and billing-only picker surface", () => {
  const base = { id: "c", name: "Property", companyId: "", street: "1 Test", city: "Denver",
    state: "CO", zip: "80000", billToMode: "property", billingName: null, parentCustomerId: null };
  it("projects only the assigned term label for nonbilling customer viewers without opening the terms list", async () => {
    mocks.get.mockResolvedValue({ ...base, companyId: company, qboTermId: "t1" });
    mocks.remote.mockResolvedValue({ ok: true, json: async () => ({ QueryResponse: { Term: [
      { Id: "t1", Name: "Net 30", Active: true }, { Id: "t2", Name: "Net 60", Active: true },
    ] } }) });
    const response = await request(app("field_manager")).get("/api/customers/c/quickbooks-card");
    expect(response.status).toBe(200); expect(response.body.termLabel).toBe("Net 30");
    expect(response.body.termLookupError).toBeNull(); expect(response.body.terms).toBeUndefined();
    expect(mocks.remote.mock.calls[0][0]).toBe(company);
    expect((await request(app("field_manager")).get("/api/qbo/terms")).status).toBe(403);
  });
  it("keeps the live bill-to available when assigned term lookup fails, with an explicit retryable error", async () => {
    mocks.get.mockResolvedValue({ ...base, companyId: company, qboTermId: "t1" });
    mocks.remote.mockRejectedValue(new Error("synthetic term failure"));
    const response = await request(app()).get("/api/customers/c/quickbooks-card");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ termLabel: null, termLookupError: "Unable to look up billing term. Refresh to try again.",
      billTo: { street: "1 Test" } });
  });
  it("resolves master-parent bill-to and contacts live without cache billing reads", async () => {
    const child = { ...base, companyId: company, parentCustomerId: "p" };
    const parent = { ...base, companyId: company, id: "p", name: "Parent", isParent: "true",
      branchBillingMode: "master", street: "2 Live", billingEmails: ["live@example.test"] };
    mocks.get.mockImplementation(async (id: string, co: string) => co === company ? id === "p" ? parent : child : undefined);
    const response = await request(app()).get("/api/customers/c/quickbooks-card");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ billsThroughParent: true, effectiveCustomer: { id: "p", billingEmails: ["live@example.test"] },
      billTo: { name: "Parent", street: "2 Live" }, baselineAt: null, writeEnabled: false });
    expect(mocks.get.mock.calls.every(call => call[1] === company)).toBe(true);
  });
  it("reads management-company address at request time and returns missing-address problems explicitly", async () => {
    mocks.get.mockResolvedValue({ ...base, companyId: company, billToMode: "management_company", propertyManagementCompanyId: "pm" });
    mocks.pm.mockResolvedValue({ id: "pm", companyId: company, name: "Directory", street: "3 New", city: "Denver", state: "CO", zip: "80000" });
    let result = await request(app()).get("/api/customers/c/quickbooks-card");
    expect(result.body).toMatchObject({ billToModeLabel: "c/o Directory", billTo: { street: "c/o Directory", street2: "3 New" } });
    mocks.pm.mockResolvedValue(undefined);
    result = await request(app()).get("/api/customers/c/quickbooks-card");
    expect(result.body.billTo).toEqual({ problem: "BILL_TO_INCOMPLETE" });
  });
  it("returns 404 for another company's customer", async () => {
    mocks.get.mockResolvedValue(undefined);
    expect((await request(app()).get("/api/customers/foreign/quickbooks-card")).status).toBe(404);
    expect(mocks.get).toHaveBeenCalledWith("foreign", company);
  });
  it("allows billing-tagged reviewers only the scoped picker projection", async () => {
    const response = await request(app("field", ["billing"])).get("/api/qbo/customer-review-options");
    expect(response.body).toEqual({ customers: [], quickbooks: [] });
    const { PgDialect } = await import("drizzle-orm/pg-core");
    for (const [predicate] of mocks.where.mock.calls)
      expect(new PgDialect().sqlToQuery(predicate).params).toEqual([company]);
    expect((await request(app("field")).get("/api/qbo/customer-review-options")).status).toBe(403);
    expect((await request(app()).get("/api/qbo/customer-review-options").set("X-Company-Id", "stale")).status).toBe(409);
  });
});
