import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), preview: vi.fn() }));
vi.mock("../services/estimateQuickItems", () => ({ estimateQuickCatalog: mocks }));
vi.mock("../services/estimateRates", () => ({ previewEstimateRates: mocks.preview }));
import { registerEstimateSetupRoutes } from "./estimateSetup";
function appFor(role: string | null = "admin", company: string | null = "a") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { activeRole: role, activeCompanyId: company } as Express.User; next();
  });
  registerEstimateSetupRoutes(app); return app;
}
const endpoints = [["get", "/api/quick-items"], ["post", "/api/quick-items"], ["patch", "/api/quick-items/id"],
  ["delete", "/api/quick-items/id"], ["get", "/api/estimates/rates/preview?customerId=c"]] as const;
beforeEach(() => {
  vi.resetAllMocks(); mocks.list.mockResolvedValue([]); mocks.create.mockResolvedValue({ id: "id" });
  mocks.update.mockResolvedValue({ id: "id" }); mocks.preview.mockResolvedValue({ items: [] });
});
describe("estimate catalog and preview boundaries", () => {
  it.each(endpoints)("protects %s %s", async (method, url) => {
    for (const role of [null, "field", "crew_supervisor", "field_manager", "landscape_supervisor", "mapping", "chemical_manager", "shop_manager", "irrigation_manager"]) {
      expect((await request(appFor(role))[method](url).send({})).status).toBe(role === null ? 401 : 403);
    }
    expect((await request(appFor("office", null))[method](url)).status).toBe(403);
    expect((await request(appFor())[method](url).set("X-Company-Id", "b").send({})).status).toBe(409);
    Object.values(mocks).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it.each(["admin", "office"])("allows %s reads scoped to the session", async role => {
    expect((await request(appFor(role)).get("/api/quick-items?kind=fee")).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("a", "fee");
    expect((await request(appFor(role)).get("/api/estimates/rates/preview?customerId=c")).body).toEqual({ items: [] });
    expect(mocks.preview).toHaveBeenCalledWith("a", "c");
  });
  it("validates filters, required customer, and customer ownership errors", async () => {
    expect((await request(appFor()).get("/api/quick-items?kind=other")).status).toBe(400);
    expect((await request(appFor()).get("/api/estimates/rates/preview")).status).toBe(400);
    mocks.preview.mockRejectedValue({ status: 404, message: "Customer not found" });
    expect((await request(appFor()).get("/api/estimates/rates/preview?customerId=foreign")).status).toBe(404);
  });
  it("defaults equipment/fee umbrellas and preserves optional null rates", async () => {
    expect((await request(appFor()).post("/api/quick-items").send({ kind: "equipment", label: " Skid " })).status).toBe(201);
    expect(mocks.create).toHaveBeenLastCalledWith("a", expect.objectContaining({ label: "Skid", umbrellaKey: "landscape_labor" }));
    expect(mocks.create.mock.calls[0][1].defaultRateCents).toBeUndefined();
    await request(appFor()).post("/api/quick-items").send({ kind: "fee", label: "Disposal", defaultRateCents: null, umbrellaKey: "" });
    expect(mocks.create).toHaveBeenLastCalledWith("a", expect.objectContaining({ defaultRateCents: null, umbrellaKey: "fees_surcharges" }));
  });
  it("PATCH writes only supplied fields, including an explicit null and reactivation", async () => {
    await request(appFor()).patch("/api/quick-items/id").send({ label: "New" });
    expect(mocks.update).toHaveBeenLastCalledWith("a", "id", { label: "New" });
    await request(appFor()).patch("/api/quick-items/id").send({ defaultRateCents: null, isActive: true });
    expect(mocks.update).toHaveBeenLastCalledWith("a", "id", { defaultRateCents: null, isActive: true });
    expect((await request(appFor()).patch("/api/quick-items/id").send({})).status).toBe(400);
  });
  it.each([{ umbrellaKey: "fleet" }, { defaultUnit: "mile" }, { kind: "truck" }, { defaultRateCents: -1 }, { defaultRateCents: "" }, { companyId: "foreign" }])("rejects invalid patch %j", async body => {
    expect((await request(appFor()).patch("/api/quick-items/id").send(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("returns 409 for race-safe case-insensitive database uniqueness conflicts", async () => {
    mocks.create.mockRejectedValue({ cause: { code: "23505" } });
    expect((await request(appFor()).post("/api/quick-items").send({ kind: "fee", label: "Duplicate" })).status).toBe(409);
  });
  it("soft deactivates using company + id and returns 404 for foreign ids", async () => {
    expect((await request(appFor()).delete("/api/quick-items/id")).status).toBe(200);
    expect(mocks.update).toHaveBeenLastCalledWith("a", "id", { isActive: false });
    mocks.update.mockResolvedValue(undefined);
    expect((await request(appFor()).patch("/api/quick-items/foreign").send({ label: "x" })).status).toBe(404);
    expect((await request(appFor()).delete("/api/quick-items/foreign")).status).toBe(404);
  });
});
