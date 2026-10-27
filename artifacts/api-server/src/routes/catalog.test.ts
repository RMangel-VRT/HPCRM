import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getHardscapeCatalog: vi.fn(), createHardscapeCatalogItem: vi.fn(),
  updateHardscapeCatalogItem: vi.fn(), upsertHardscapeCatalogItem: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: mocks }));
import { registerCatalogRoutes } from "./catalog";
const item = { id: "a", companyId: "company-a", sku: "SKU", name: "Rock", category: "general", description: null,
  unit: "ea", wholesaleCostCents: null, retailPriceCents: 12345, isActive: true };
const csv = "sku,category,name,description,unit,wholesale_cost,retail_price,active\nSKU,general,Rock,,ea,,123.45,true";
const endpoints = [["get", ""], ["post", ""], ["patch", "/a"], ["delete", "/a"], ["post", "/import-csv"], ["get", "/export-csv"]] as const;
function appFor(role: string | null = "admin", company: string | null = "company-a") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { id: "user", activeRole: role, activeCompanyId: company } as Express.User;
    next();
  });
  registerCatalogRoutes(app);
  return app;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getHardscapeCatalog.mockResolvedValue({ items: [item], categories: ["general"] });
  mocks.createHardscapeCatalogItem.mockResolvedValue(item);
  mocks.updateHardscapeCatalogItem.mockResolvedValue(item);
  mocks.upsertHardscapeCatalogItem.mockResolvedValue("updated");
});
describe("hardscape endpoint authentication, role and tenant contracts", () => {
  it.each(endpoints)("gates %s %s before accessing storage or reading uploads", async (method, path) => {
    for (const role of [null, "field", "field_manager", "crew_supervisor", "mapping", "landscape_supervisor", "chemical_manager", "shop_manager", "irrigation_manager"]) {
      const response = await request(appFor(role))[method](`/api/hardscape-catalog${path}`).send({});
      expect(response.status).toBe(role === null ? 401 : 403);
    }
    expect((await request(appFor("admin", null))[method](`/api/hardscape-catalog${path}`).send({})).status).toBe(403);
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
  it.each(endpoints)("rejects stale-company %s %s before reading or writing data", async (method, path) => {
    const response = await request(appFor("admin", "company-b"))[method](`/api/hardscape-catalog${path}`)
      .set("X-Company-Id", "company-a").send({});
    expect(response.status).toBe(409);
    expect(response.body.message).toContain("Active company changed");
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
  it.each(["admin", "office"])("allows %s and scopes list, categories, search and export", async role => {
    const app = appFor(role, "company-b");
    const list = await request(app).get("/api/hardscape-catalog?search=stone&category=general&includeInactive=true");
    expect(list.status).toBe(200);
    expect(mocks.getHardscapeCatalog).toHaveBeenCalledWith("company-b", { search: "stone", category: "general", includeInactive: true });
    expect(list.headers["cache-control"]).toContain("no-store");
    const exp = await request(app).get("/api/hardscape-catalog/export-csv");
    expect(exp.status).toBe(200);
    expect(exp.headers["content-disposition"]).toMatch(/^attachment; filename="hardscape-catalog-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(exp.headers["content-type"]).toContain("text/csv");
    expect(exp.text).toContain(",123.45,true");
    expect(mocks.getHardscapeCatalog).toHaveBeenLastCalledWith("company-b", { includeInactive: true });
  });
  it("creates with server-owned tenant and immutable umbrella; duplicate SKU is 409", async () => {
    const app = appFor();
    expect((await request(app).post("/api/hardscape-catalog").send({ name: "Rock", category: "general", sku: " S " })).status).toBe(201);
    expect(mocks.createHardscapeCatalogItem).toHaveBeenCalledWith("company-a", { name: "Rock", category: "general", sku: "S", unit: "ea", isActive: true });
    expect((await request(app).post("/api/hardscape-catalog").send({ name: "Rock", category: "general", companyId: "foreign" })).status).toBe(400);
    mocks.createHardscapeCatalogItem.mockRejectedValue({ cause: { code: "23505" } });
    expect((await request(app).post("/api/hardscape-catalog").send({ name: "Rock", category: "general", sku: "S" })).status).toBe(409);
  });
  it("PATCH only passes supplied keys, preserves nulls and handles duplicates/missing scoped ID", async () => {
    const app = appFor();
    expect((await request(app).patch("/api/hardscape-catalog/a").send({ description: null, wholesaleCostCents: null })).status).toBe(200);
    expect(mocks.updateHardscapeCatalogItem).toHaveBeenCalledWith("company-a", "a", { description: null, wholesaleCostCents: null });
    expect((await request(app).patch("/api/hardscape-catalog/a").send({})).status).toBe(200);
    expect(mocks.updateHardscapeCatalogItem).toHaveBeenLastCalledWith("company-a", "a", {});
    expect((await request(app).patch("/api/hardscape-catalog/a").send({ umbrellaKey: "plants" })).status).toBe(400);
    mocks.updateHardscapeCatalogItem.mockRejectedValueOnce({ code: "23505" }).mockResolvedValueOnce(undefined);
    expect((await request(app).patch("/api/hardscape-catalog/a").send({ sku: "other" })).status).toBe(409);
    expect((await request(app).patch("/api/hardscape-catalog/foreign").send({ name: "no" })).status).toBe(404);
  });
  it("DELETE only writes inactive and hides foreign/missing IDs", async () => {
    const app = appFor();
    expect((await request(app).delete("/api/hardscape-catalog/a")).status).toBe(200);
    expect(mocks.updateHardscapeCatalogItem).toHaveBeenCalledWith("company-a", "a", { isActive: false });
    mocks.updateHardscapeCatalogItem.mockResolvedValue(undefined);
    expect((await request(app).delete("/api/hardscape-catalog/foreign")).status).toBe(404);
  });
  it("accepts text, JSON csv and multipart; rejects headers/body before writes and reports row failures", async () => {
    const app = appFor("office", "company-b");
    for (const response of [
      await request(app).post("/api/hardscape-catalog/import-csv").type("text/csv").send(csv),
      await request(app).post("/api/hardscape-catalog/import-csv").send({ csv }),
      await request(app).post("/api/hardscape-catalog/import-csv").attach("file", Buffer.from(csv), "goods.csv"),
    ]) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ inserted: 0, updated: 1, skipped: [] });
    }
    expect(mocks.upsertHardscapeCatalogItem).toHaveBeenCalledWith("company-b", expect.objectContaining({ sku: "SKU" }));
    mocks.upsertHardscapeCatalogItem.mockClear();
    expect((await request(app).post("/api/hardscape-catalog/import-csv").send({})).status).toBe(400);
    expect((await request(app).post("/api/hardscape-catalog/import-csv").type("text/plain").send("bad,header")).status).toBe(400);
    expect(mocks.upsertHardscapeCatalogItem).not.toHaveBeenCalled();
    mocks.upsertHardscapeCatalogItem.mockRejectedValueOnce(new Error("database failure")).mockResolvedValueOnce("inserted");
    const response = await request(app).post("/api/hardscape-catalog/import-csv").send({ csv: csv + "\nNEW,general,Next,,ea,,,false" });
    expect(response.body).toEqual({ inserted: 1, updated: 0, skipped: [{ line: 2, reason: "Unable to save row" }] });
  });
  it("rejects oversize multipart files with visible validation error", async () => {
    const response = await request(appFor()).post("/api/hardscape-catalog/import-csv").attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), "big.csv");
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("5 MB");
  });
});
