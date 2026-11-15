import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fiveParksFixture } from "../services/contractedServicesFixture";
import { DocumentRendererUnavailable } from "../services/documents/browser";
const mocks = vi.hoisted(() => ({ load: vi.fn(), render: vi.fn(), select: vi.fn(), rates: [] as any[] }));
vi.mock("../db", () => ({ db: { select: () => { mocks.select(); return { from: () => ({ where: async () => mocks.rates }) }; } } }));
vi.mock("../lib/customerServiceFulfillmentLoader", () => ({ loadServiceFulfillmentInputs: mocks.load }));
vi.mock("../services/documents/render", () => ({ renderDocumentPdf: mocks.render }));
vi.mock("../lib/customerServiceFulfillment", async importOriginal => {
  const original = await importOriginal<typeof import("../lib/customerServiceFulfillment")>();
  return { ...original, customerServiceFulfillment: (data: any, ...args: [string, string?]) => {
    const result = original.customerServiceFulfillment(data, ...args);
    return data.testRows && result ? { ...result, rows: data.testRows } : result;
  } };
});
import { registerCustomerServices } from "./customerServices";
const url = "/api/customers/p/contracted-services.pdf";
function mount(role = "office", companyId = "c", signedIn = true) {
  const app = express();
  app.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => signedIn, user: { activeCompanyId: companyId, accessRole: role } }); next(); });
  registerCustomerServices(app); return request(app);
}
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue(fiveParksFixture()); mocks.render.mockResolvedValue(Buffer.from("%PDF-test")); mocks.rates = []; });
describe("SC3 protected season PDF", () => {
  it.each(["admin", "office", "field", "field_manager", "chemical_manager", "crew_supervisor", "irrigation_manager", "landscape_supervisor", "mapping"])("allows the services reader %s", async role => {
    const r = await mount(role).get(`${url}?termId=t`).expect(200);
    expect(r.headers["content-type"]).toContain("application/pdf");
    expect(r.headers["cache-control"]).toBe("private, no-store");
    expect(r.headers["content-disposition"]).toMatch(/^inline;/);
    expect(mocks.render.mock.calls[0][0]).toMatchObject({ shortHeaderNumber: "2025–26" });
  });
  it("validates query, role and company before rendering", async () => {
    await mount().get(url).expect(400);
    await mount().get(`${url}?termId=t&termId=other`).expect(400);
    await mount().get(`${url}?termId=unknown`).expect(404);
    await mount().get(`${url}?termId=t`).set("X-Company-Id", "other").expect(409);
    await mount("office", "").get(`${url}?termId=t`).expect(403);
    await mount("shop_manager").get(`${url}?termId=t`).expect(403);
    await mount("office", "c", false).get(`${url}?termId=t`).expect(401);
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it.each(["admin", "office", "field", "field_manager", "chemical_manager", "crew_supervisor", "irrigation_manager", "landscape_supervisor", "mapping"])(
    "enforces commercial privacy on direct PDF requests by %s", async role => {
      const data = fiveParksFixture();
      data.scope![0].priceCents = 938400;
      data.scope![0].details = { billing: "billed_when_done", billingPrice: "PRIVATE_SCOPE_PRICE" };
      data.scope!.push({ ...data.scope![0], serviceKey: "fall_aeration", details: { billingPrice: "PRIVATE_OPTION_PRICE" } });
      mocks.rates = [{ companyId: "c", termId: "t", sortOrder: 1, label: "PRIVATE_RATE", priceCents: 44991, unit: "per hour" }];
      data.rates = [...mocks.rates]; // Even preloaded commercial data must not leak.
      mocks.load.mockResolvedValue(data);
      await mount(role).get(`${url}?termId=t&download=1`).expect(200);
      const html = mocks.render.mock.calls[0][0].html;
      if (["admin", "office"].includes(role)) {
        expect(mocks.select).toHaveBeenCalledOnce();
        for (const text of ["Billed separately", "On request (priced when ordered)", "Rates in your agreement",
          "PRIVATE_SCOPE_PRICE", "PRIVATE_OPTION_PRICE", "PRIVATE_RATE", "$449.91"]) expect(html).toContain(text);
      } else {
        expect(mocks.select).not.toHaveBeenCalled();
        expect(html).not.toMatch(/Billed separately|On request \(priced when ordered\)|Rates in your agreement|PRIVATE_|\$\d/);
        expect(html).toContain("26 visits");
        expect(html).toContain("13 contracted services");
      }
    });
  it("never exposes a foreign customer and sanitizes download filenames", async () => {
    await mount().get("/api/customers/foreign/contracted-services.pdf?termId=t").expect(404);
    const data = fiveParksFixture(); data.customers[0].name = 'Client\r\n"/bad';
    mocks.load.mockResolvedValue(data);
    const r = await mount().get(`${url}?termId=t&download=1`).expect(200);
    expect(r.headers["content-disposition"]).toMatch(/^attachment; filename="Contracted Services - Client____bad/);
  });
  it.each([
    ["aeration", null, "no_count"], ["backflow", null, "no_count"],
    ["aeration", 2, "needs_rounds"], ["aeration", -1, "invalid_count"],
    ["mowing", -1, "invalid_count"], ["mowing", 2, "duplicate_lines"],
    ["aeration", 1, "duplicate_lines"], ["backflow", -1, "invalid_count"],
  ])("blocks %s %s %s before invoking renderer", async (serviceKey, quantity, issue) => {
    const data = fiveParksFixture();
    data.scope = data.scope!.filter(s => s.serviceKey !== serviceKey);
    data.scope.push({ ...data.scope[0], serviceKey, quantity });
    if (issue === "no_count") data.calendar = data.calendar.filter(c => c.serviceKey !== serviceKey);
    if (issue === "duplicate_lines") data.scope.push({ ...data.scope.at(-1)! });
    data.terms[0].status = "sent";
    mocks.load.mockResolvedValue(data);
    const r = await mount().get(`${url}?termId=t`).expect(409);
    expect(r.body).toMatchObject({ error: "SCOPE_NEEDS_REVIEW", services: [expect.any(String)] });
    expect(JSON.stringify(r.body)).not.toMatch(/campaign|round|no_count|invalid_count/);
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("prints no-count routes but returns safe 503 for unavailable Chromium", async () => {
    await mount().get(`${url}?termId=t`).expect(200);
    expect(mocks.render.mock.calls[0][0].html).toContain("Monthly");
    mocks.render.mockRejectedValue(new DocumentRendererUnavailable("EXECUTABLE_NOT_FOUND"));
    await mount().get(`${url}?termId=t`).expect(503, { error: "DOCUMENT_RENDERER_UNAVAILABLE" });
  });
  it.each(["campaign", "checklist", "route"])("enforces the entire %s blocking matrix even behind another status and zero owed", async scheduling => {
    for (const issue of ["no_count", "needs_rounds", "invalid_count", "duplicate_lines"]) {
      const data = fiveParksFixture() as any;
      data.testRows = [{ serviceKey: "aeration", scheduling, owed: 0, done: 0, status: "waiting_on_signature", issues: ["waiting_on_signature", issue], rounds: [] }];
      mocks.load.mockResolvedValue(data);
      const allowed = scheduling === "route" && ["no_count", "needs_rounds"].includes(issue);
      await mount().get(`${url}?termId=t`).expect(allowed ? 200 : 409);
      if (!allowed) expect(mocks.render).not.toHaveBeenCalled();
      mocks.render.mockClear();
    }
  });
  it("lists covered children, never an empty parent, and hides snow-only without events", async () => {
    const data = fiveParksFixture();
    data.customers.push({ ...data.customers[0], id: "parent", isParent: "true" });
    data.customers[0].parentCustomerId = "parent";
    data.agreements[0].customerId = "parent";
    mocks.load.mockResolvedValue(data);
    const r = await mount().get("/api/customers/parent/contracted-services-targets?termId=t").expect(200);
    expect(r.body).toEqual({ parent: true, targets: [{ customerId: "p", customerName: data.customers[0].name, agreementId: "a" }] });
    await mount().get("/api/customers/parent/contracted-services.pdf?termId=t").expect(404);
    data.terms[0].line = "snow"; data.scope = [];
    const empty = await mount().get("/api/customers/parent/contracted-services-targets?termId=t").expect(200);
    expect(empty.body.targets).toEqual([]);
  });
});
