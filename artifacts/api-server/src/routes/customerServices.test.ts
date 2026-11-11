import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRole } from "../../../../lib/db/src/accessRole";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../lib/customerServiceFulfillmentLoader", () => ({ loadServiceFulfillmentInputs: mocks.load }));
import { registerCustomerServices } from "./customerServices";

function mount(role = "office", companyId = "c", authenticated = true) {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated, user: {
      id: "manager", activeRole: role, accessRole: accessRole(role), activeCompanyId: companyId,
    } });
    next();
  });
  registerCustomerServices(app);
  return request(app);
}
const root = "/api/customers/p/services";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockImplementation(async (_db, companyId) => ({
    customers: companyId === "c" ? [{ id: "p", companyId: "c", isParent: "false", accountManagerId: "different-manager" }] : [],
    agreements: [{ id: "a", customerId: "p", companyId }],
    terms: [{ id: "t", agreementId: "a", companyId, line: "landscape", status: "signed",
      startDate: "2026-01-01", endDate: "2028-12-31", seasonLabel: "Fixture" }],
    scope: [], calendar: [], campaigns: [], items: [], stops: [], visits: [],
  }));
});
describe("authorized customer services endpoint", () => {
  it.each(["admin", "office", "account_manager", "field_manager", "chemical_manager", "field",
    "irrigation_manager", "mapping", "landscape_supervisor", "crew_supervisor"])("matches contract-summary access for %s", async role => {
    const response = await mount(role).get(root).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toMatchObject({ customerId: "p", selectedTerm: { termId: "t" }, rows: [],
      alsoInContract: [], otherWork: [], retainedWork: [] });
    expect(JSON.stringify(response.body)).not.toMatch(/accountManagerId|rates|billing|annual|price|filePath/);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load.mock.calls[0][1]).toBe("c");
  });
  it.each(["shop_manager", "unknown"])("denies unsupported %s before loading data", async role => {
    await mount(role).get(root).expect(403);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("rejects signed-out, company changes and missing active company before loading", async () => {
    await mount("office", "c", false).get(root).expect(401);
    await mount("office", "").get(root).expect(403);
    await mount().get(root).set("X-Company-Id", "other").expect(409);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("does not let a projected account-manager role cross company boundaries", async () => {
    await mount("account_manager", "foreign").get(root).expect(404);
    expect(mocks.load.mock.calls[0][1]).toBe("foreign");
  });
  it("accepts owned term only, never arbitrary term ids or query shapes", async () => {
    await mount().get(`${root}?termId=t`).expect(200);
    await mount().get(`${root}?termId=another-customer-term`).expect(404);
    await mount().get(`${root}?termId=`).expect(400);
    await mount().get(`${root}?termId=t&termId=other`).expect(400);
    await mount().get(`${root}?companyId=other`).expect(400);
  });
});
