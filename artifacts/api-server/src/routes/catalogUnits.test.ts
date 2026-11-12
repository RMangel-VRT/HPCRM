import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ESTIMATE_UNITS } from "../../../../lib/db/src/estimateUnits";
const mocks = vi.hoisted(() => ({
  createHardscapeCatalogItem: vi.fn(), updateHardscapeCatalogItem: vi.fn(),
  upsertHardscapeCatalogItem: vi.fn(), getHardscapeCatalog: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: mocks }));
import { registerCatalogRoutes } from "./catalog";

function appFor(role = "admin", companyId = "company-a") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: "fixture", accessRole: role, activeRole: role, activeCompanyId: companyId } as Express.User;
    next();
  });
  registerCatalogRoutes(app); return app;
}
afterEach(() => vi.clearAllMocks());
describe("hardscape canonical units through actual HTTP validation", () => {
  it.each(ESTIMATE_UNITS)("persists canonical %s on create and patch", async unit => {
    mocks.createHardscapeCatalogItem.mockImplementation(async (_company, data) => ({ id: "new", ...data }));
    mocks.updateHardscapeCatalogItem.mockImplementation(async (_company, _id, data) => ({ id: "new", ...data }));
    const app = appFor();
    const created = await request(app).post("/api/hardscape-catalog")
      .set("X-Company-Id", "company-a").send({ name: "Test", category: "general", unit });
    expect(created.status).toBe(201);
    expect(created.body.unit).toBe(unit);
    expect(mocks.createHardscapeCatalogItem).toHaveBeenCalledWith("company-a", expect.objectContaining({ unit }));
    const patched = await request(app).patch("/api/hardscape-catalog/new").send({ unit });
    expect(patched.status).toBe(200);
    expect(mocks.updateHardscapeCatalogItem).toHaveBeenCalledWith("company-a", "new", { unit });
  });
  it("rejects unmapped and noncanonical direct writes before storage", async () => {
    for (const unit of ["pallet", "yd3", "each", ""]) {
      expect((await request(appFor()).post("/api/hardscape-catalog").send({ name: "Test", category: "general", unit })).status).toBe(400);
      expect((await request(appFor()).patch("/api/hardscape-catalog/new").send({ unit })).status).toBe(400);
    }
    expect(mocks.createHardscapeCatalogItem).not.toHaveBeenCalled();
    expect(mocks.updateHardscapeCatalogItem).not.toHaveBeenCalled();
  });
  it("maps legacy imports, reports invalid rows, exports mapped values and visibly retains unknown units", async () => {
    mocks.upsertHardscapeCatalogItem.mockResolvedValue("inserted");
    const response = await request(appFor()).post("/api/hardscape-catalog/import-csv").send({
      csv: "sku,category,name,description,unit,wholesale_cost,retail_price,active\n1,general,Yard,,yd3,,,true\n2,general,Unknown,,pallet,,,true",
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ inserted: 1, skipped: [{ line: 3, reason: expect.stringContaining("unit") }] });
    expect(mocks.upsertHardscapeCatalogItem).toHaveBeenCalledWith("company-a", expect.objectContaining({ unit: "CU. YD" }));
    mocks.getHardscapeCatalog.mockResolvedValue({ items: [{ unit: "yd3" }, { unit: "pallet" }] });
    const exported = await request(appFor()).get("/api/hardscape-catalog/export-csv");
    expect(exported.status).toBe(200); expect(exported.text).toContain("CU. YD"); expect(exported.text).toContain("pallet");
  });
  it("retains access and company guards without any catalog writes", async () => {
    expect((await request(appFor("crew_supervisor")).post("/api/hardscape-catalog").send({})).status).toBe(403);
    expect((await request(appFor()).post("/api/hardscape-catalog").set("X-Company-Id", "company-b").send({})).status).toBe(409);
    expect(mocks.createHardscapeCatalogItem).not.toHaveBeenCalled();
  });
});
