import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  rateCardItems, contracts, customers, agreements, agreementTerms, termLegacySources,
  contractStatusHistory, contractDocuments, termDocuments, termStatusHistory,
  contractServices, contractMonthlyAmounts, customerServicePlans, customerRateSheets, propertyManagementCompanies,
} from "@workspace/db";

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), transaction: vi.fn(), where: vi.fn() }));
vi.mock("../db", () => ({ db: mocks }));
import { registerContractCenterRoutes } from "./contractCenter";
vi.mock("../objectStorage", () => ({ ObjectStorageService: vi.fn() }));
vi.mock("../objectAcl", () => ({ ObjectAccessGroupType: { COMPANY_MEMBER: "company_member" }, ObjectPermission: { READ: "read" } }));
vi.mock("../utils/parentGuard", () => ({ assertNotParentCustomer: vi.fn() }));

const URL = "/api/admin/contract-center/copy-legacy";
const COMPANY = "company";
function app(options: { role?: string; authenticated?: boolean; superadmin?: boolean; company?: string | null } = {}) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    (req as any).isAuthenticated = () => options.authenticated ?? true;
    (req as any).user = { id: "admin", activeRole: options.role ?? "admin", isSuperAdminBool: options.superadmin ?? false,
      activeCompanyId: options.company === undefined ? COMPANY : options.company };
    next();
  });
  registerContractCenterRoutes(instance);
  return instance;
}
const oldContract = (id: string, customerId = "a") => ({ id, customerId, companyId: COMPANY, serviceType: "Maintenance",
  startDate: new Date("2026-01-01Z"), endDate: new Date("2026-12-31Z"), status: "active", billingPattern: "12-of-12",
  notes: null, po: null, hasMobilizationFee: false, mobilizationFeeAmount: 0 });
const customer = (id: string) => ({ id, companyId: COMPANY, name: id, street: "1 Main", city: "Denver", state: "CO", zip: "80000",
  propertyManagementCompanyId: null, managementCompany: null });
const card = { id: "rate", companyId: COMPANY, rateKey: "rate_general_labor", line: "landscape", active: true,
  label: "Labor", category: "Labor", priceCents: 1000, priceText: null, unit: "hour", minimum: null, sortOrder: 0 };
let rows: Map<unknown, unknown[]>;
let committed: Array<{ table: unknown; values: any[] }>;
let failCustomer: string | null;
let existingLinks: Set<string>;

beforeEach(() => {
  vi.resetAllMocks();
  rows = new Map<unknown, unknown[]>([[rateCardItems, [card]], [contracts, [oldContract("c1")]], [customers, [customer("a")]]]);
  committed = []; failCustomer = null; existingLinks = new Set();
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      const builder = {
        innerJoin: () => builder,
        where: async (predicate: any) => {
          mocks.where(table, new PgDialect().sqlToQuery(predicate));
          return rows.get(table) ?? [];
        },
      };
      return builder;
    },
  }));
  // Model rollback by publishing staged rows only after the callback completes.
  mocks.transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
    const staged: typeof committed = [];
    await callback({ insert: (table: unknown) => ({
      values: async (value: any) => {
        const values = Array.isArray(value) ? value : [value];
        if (table === agreements && values[0].customerId === failCustomer) throw new Error("Customer insert failed");
        if (table === termLegacySources && values.some(v => existingLinks.has(v.legacyContractId))) throw new Error("duplicate legacy link");
        staged.push({ table, values });
      },
    }) });
    committed.push(...staged);
    staged.filter(s => s.table === termLegacySources).flatMap(s => s.values).forEach(v => existingLinks.add(v.legacyContractId));
  });
});

describe("legacy copy endpoint safety", () => {
  it.each(["office", "field", "field_manager", "crew_supervisor", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor", "unknown"])("rejects %s before any reads", async role => {
    expect((await request(app({ role })).post(URL).send({ dryRun: false })).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires authentication and company, including for superadmin", async () => {
    expect((await request(app({ authenticated: false })).post(URL)).status).toBe(401);
    expect((await request(app({ superadmin: true, company: null })).post(URL)).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("allows superadmin and defaults to dry run with zero writes", async () => {
    const response = await request(app({ superadmin: true, role: "field" })).post(URL);
    expect(response.status).toBe(200);
    expect(response.body.dryRun).toBe(true);
    expect(response.body.summary).toMatchObject({ customers: 1, agreements: 1, terms: 1, alreadyCopied: 0 });
    expect(response.body.customers[0].agreements[0].terms[0].legacyContractIds).toEqual(["c1"]);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(committed).toEqual([]);
  });
  it.each([true, false])("rejects an empty card in mode %s with exact guidance", async dryRun => {
    rows.set(rateCardItems, []);
    const response = await request(app()).post(URL).send({ dryRun });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Load the standard rates first (Settings › Contracts)");
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([{ dryRun: "false" }, { dryRun: null }, { customerId: "b" }, []])("rejects invalid body %j", async body => {
    expect((await request(app()).post(URL).send(body)).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("scopes every bulk read and history relationship to active company", async () => {
    await request(app()).post(URL).send({ dryRun: true });
    expect(mocks.where).toHaveBeenCalledTimes(11);
    for (const [, query] of mocks.where.mock.calls) {
      expect(query.params).toEqual([COMPANY]);
      expect(query.sql).toContain('"company_id"');
    }
    const historyQuery = mocks.where.mock.calls.find(([t]) => t === contractStatusHistory)![1];
    expect(historyQuery.sql).toContain('"contracts"."company_id"');
  });
  it("does not admit foreign source rows or relationships into the write plan", async () => {
    rows.set(contracts, [oldContract("c1"), { ...oldContract("foreign"), companyId: "other" }]);
    rows.set(contractServices, [{ id: "foreign-service", companyId: "other", contractId: "c1", serviceType: "mowing", annualCount: 100 }]);
    const response = await request(app()).post(URL).send({ dryRun: false });
    expect(response.body.summary).toMatchObject({ customers: 1, terms: 1, scopeLines: 0 });
    expect(committed.filter(c => c.table === termLegacySources).flatMap(c => c.values).map(c => c.legacyContractId)).toEqual(["c1"]);
  });
  it("commits each customer atomically and excludes failure counts while continuing", async () => {
    rows.set(contracts, [oldContract("bad", "a"), oldContract("good", "b")]);
    rows.set(customers, [customer("a"), customer("b")]);
    failCustomer = "a";
    const response = await request(app()).post(URL).send({ dryRun: false });
    expect(response.body.dryRun).toBe(false);
    expect(response.body.summary).toMatchObject({ customers: 1, agreements: 1, terms: 1 });
    expect(response.body.failures).toEqual([{ customerId: "a", customerName: "a", error: "Customer insert failed" }]);
    expect(response.body.customers[0].error).toBe("Customer insert failed");
    expect(response.body.customers[0].agreements[0].terms[0].flags).toContain("Copy failed: Customer insert failed");
    expect(committed.filter(c => c.table === agreements).flatMap(c => c.values).map(c => c.customerId)).toEqual(["b"]);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
  it("rolls back all staged records on a duplicate legacy link, then copies the next customer", async () => {
    rows.set(contracts, [oldContract("duplicate", "a"), oldContract("good", "b")]);
    rows.set(customers, [customer("a"), customer("b")]);
    existingLinks.add("duplicate"); // concurrent copier after this run's source reads
    const response = await request(app()).post(URL).send({ dryRun: false });
    expect(response.body.failures[0].error).toBe("duplicate legacy link");
    expect(response.body.summary.terms).toBe(1);
    expect(committed.filter(c => c.table === agreements).flatMap(c => c.values).map(c => c.customerId)).toEqual(["b"]);
    expect(committed.filter(c => c.table === termLegacySources).flatMap(c => c.values).map(c => c.legacyContractId)).toEqual(["good"]);
  });
  it("assigns admin creator, links terms chronologically, preserves document/history metadata, and never writes legacy tables", async () => {
    const date = new Date("2025-11-01Z");
    rows.set(contracts, [oldContract("c1"), { ...oldContract("c0"), startDate: new Date("2025-01-01Z"), endDate: new Date("2025-12-31Z"), status: "ended" }]);
    rows.set(contractDocuments, [{ id: "doc", companyId: COMPANY, contractId: "c1", version: 4, filename: "signed.pdf",
      storageObjectPath: "/objects/old", mimeType: "application/pdf", fileSize: 222, uploadedBy: "actor", uploadedAt: date }]);
    rows.set(contractStatusHistory, [{ history: { id: "h", contractId: "c1", oldStatus: "paused", newStatus: "active", changedBy: "actor", createdAt: date } }]);
    const response = await request(app()).post(URL).send({ dryRun: false });
    expect(response.body.summary.documents).toBe(1);
    const terms = committed.filter(c => c.table === agreementTerms).flatMap(c => c.values);
    expect(terms[0]).toMatchObject({ createdBy: "admin", status: "renewed", renewedFromTermId: null });
    expect(terms[1]).toMatchObject({ createdBy: "admin", renewedFromTermId: terms[0].id });
    expect(committed.find(c => c.table === termDocuments)!.values[0]).toMatchObject({
      storageObjectPath: "/objects/old", version: 4, createdAt: date, uploadedBy: "actor",
    });
    expect(committed.find(c => c.table === termStatusHistory)!.values[0]).toMatchObject({ changedBy: "actor", createdAt: date, note: "Old system: paused → active" });
    const legacy = [contracts, contractServices, contractMonthlyAmounts, contractDocuments, contractStatusHistory,
      customerServicePlans, customerRateSheets, propertyManagementCompanies, customers, rateCardItems];
    expect(committed.some(c => legacy.includes(c.table as any))).toBe(false);
  });
  it("repeat previews skip copied IDs and do not start another transaction", async () => {
    await request(app()).post(URL).send({ dryRun: false });
    rows.set(termLegacySources, [...existingLinks].map(legacyContractId => ({ id: legacyContractId, companyId: COMPANY, legacyContractId })));
    const response = await request(app()).post(URL);
    expect(response.body.summary).toMatchObject({ customers: 0, agreements: 0, terms: 0, alreadyCopied: 1 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("executes a Both plan with every source link, landscape-only billing and earliest document metadata (mock DB only)", async () => {
    rows.set(contracts, [oldContract("c1"), { ...oldContract("s1"), serviceType: "Snow" }]);
    rows.set(contractMonthlyAmounts, [
      { id: "a", companyId: COMPANY, contractId: "c1", month: 1, amount: 100 },
      { id: "b", companyId: COMPANY, contractId: "s1", month: 1, amount: 900 },
    ]);
    rows.set(contractDocuments, ["c1", "s1"].map((contractId, i) => ({
      id: `doc${i}`, companyId: COMPANY, contractId, version: 1, filename: "signed.pdf",
      storageObjectPath: "/objects/shared", fileSize: 100, mimeType: "application/pdf",
      uploadedBy: "actor", uploadedAt: new Date(i ? "2025-12-01Z" : "2026-01-01Z"),
    })));
    const response = await request(app()).post(URL).send({ dryRun: false });
    expect(response.body.summary).toMatchObject({ agreements: 1, terms: 1, documents: 1, billingMonths: 1 });
    expect(committed.find(c => c.table === agreements)!.values[0].line).toBe("both");
    expect(committed.find(c => c.table === agreementTerms)!.values[0]).toMatchObject({ annualPriceCents: 100, billingType: "monthly_variable" });
    expect(committed.find(c => c.table === termLegacySources)!.values.map(v => v.legacyContractId)).toEqual(["c1", "s1"]);
    expect(committed.find(c => c.table === termDocuments)!.values[0].createdAt).toEqual(new Date("2025-12-01Z"));
  });
});
