import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), upsert: vi.fn() }));
vi.mock("../services/estimateQuickItems", () => ({ estimateQuickCatalog: { list: mocks.list } }));
vi.mock("../services/quickItemCsv", () => ({ upsertQuickItemCsv: mocks.upsert }));
import { registerEstimateSetupRoutes } from "./estimateSetup";

const text = "kind,category,name,unit,price,posts_to,active\nservice,General,One,hour,Variable,landscape_labor,yes";
function appFor(role: string | null = "admin", company: string | null = "a") {
  const app = express();
  app.use(express.json({ limit: "6mb" }));
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { id: "user", activeRole: role, activeCompanyId: company } as Express.User;
    next();
  });
  registerEstimateSetupRoutes(app);
  return app;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.upsert.mockResolvedValue({ outcome: "inserted", categoryCreated: "General" });
  mocks.list.mockResolvedValue([
    { kind: "service", serviceCategoryName: "General", label: "One", defaultUnit: "HR", defaultRateCents: null, umbrellaKey: "landscape_labor", isActive: false },
    { kind: "fee", serviceCategoryName: null, label: "Two", defaultUnit: "FLAT", defaultRateCents: 0, umbrellaKey: "fees_surcharges", isActive: true },
  ]);
});
describe("guarded quick item CSV endpoints", () => {
  it.each(["import-csv", "export-csv"])("gates %s before reads/writes/uploads", async endpoint => {
    for (const role of [null, "field", "field_manager", "crew_supervisor", "mapping", "landscape_supervisor", "chemical_manager", "shop_manager", "irrigation_manager"]) {
      const req = request(appFor(role));
      const response = endpoint === "import-csv" ? await req.post(`/api/quick-items/${endpoint}?scope=services`) : await req.get(`/api/quick-items/${endpoint}?scope=services`);
      expect(response.status).toBe(role === null ? 401 : 403);
      expect(response.headers["cache-control"]).toContain("no-store");
    }
    const url = `/api/quick-items/${endpoint}?scope=services`;
    for (const [company, expected, status] of [[null, "a", 403], ["b", "a", 409], ["a", "", 400]] as const) {
      const req = request(appFor("admin", company));
      const response = endpoint === "import-csv" ? await req.post(url).set("X-Company-Id", expected) : await req.get(url).set("X-Company-Id", expected);
      expect(response.status).toBe(status);
    }
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(["admin", "office"])("permits %s multipart/text/JSON and captures company, null prices and canonical units", async role => {
    const app = appFor(role, "b");
    for (const response of [
      await request(app).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "b").attach("file", Buffer.from(text), "items.csv"),
      await request(app).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "b").type("text/csv").send(text),
      await request(app).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "b").send({ csv: text }),
    ]) expect(response.body).toEqual({ inserted: 1, updated: 0, categoriesCreated: ["General"], skipped: [] });
    expect(mocks.upsert).toHaveBeenCalledWith("b", expect.objectContaining({ defaultUnit: "HR", defaultRateCents: null }));
  });
  it("requires a valid scope and validates file/header before writes; enforces kinds in both scopes", async () => {
    const app = appFor();
    for (const scope of ["", "?scope=service", "?scope=services&scope=equipment-fees"]) {
      expect((await request(app).post(`/api/quick-items/import-csv${scope}`).set("X-Company-Id", "a").send({ csv: text })).status).toBe(400);
      expect((await request(app).get(`/api/quick-items/export-csv${scope}`).set("X-Company-Id", "a")).status).toBe(400);
    }
    for (const body of [{}, { csv: "bad,header" }]) expect((await request(app).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "a").send(body)).status).toBe(400);
    const response = await request(app).post("/api/quick-items/import-csv?scope=equipment-fees").set("X-Company-Id", "a").send({ csv: text });
    expect(response.body.skipped[0].reason).toContain("not allowed");
    const reverse = await request(app).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "a").send({ csv: text.replace("service,General", "fee,") });
    expect(reverse.body.skipped[0].reason).toContain("not allowed");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("exports the whole chosen catalog, including inactive rows, and rejects unknown units without a download", async () => {
    const app = appFor("office", "b");
    for (const scope of ["services", "equipment-fees"]) {
      const response = await request(app).get(`/api/quick-items/export-csv?scope=${scope}`).set("X-Company-Id", "b");
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.headers["content-disposition"]).toContain(`${scope}-catalog-`);
      expect(response.text).toContain(scope === "services" ? "Variable,Landscape Labor,false" : "0.00,Fees & Surcharges,true");
      expect(response.text).not.toContain(scope === "services" ? ",Two," : ",One,");
    }
    expect(mocks.list).toHaveBeenCalledWith("b");
    mocks.list.mockResolvedValue([{ kind: "fee", label: "Bad", defaultUnit: "pallet" }]);
    const bad = await request(app).get("/api/quick-items/export-csv?scope=equipment-fees").set("X-Company-Id", "b");
    expect(bad.status).toBe(422);
    expect(bad.body.message).toContain("unknown unit");
    expect(bad.headers["content-disposition"]).toBeUndefined();
  });
  it("isolates save errors, never leaks database details, and continues later rows", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("secret sql")).mockResolvedValueOnce({ outcome: "updated" });
    const response = await request(appFor()).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "a")
      .send({ csv: text + "\nservice,General,Two,HR,0,landscape_labor,true" });
    expect(response.body).toEqual({ inserted: 0, updated: 1, categoriesCreated: [], skipped: [{ line: 2, reason: "Unable to save row" }] });
  });
  it("bounds file and JSON payloads and reports upload errors", async () => {
    const app = appFor();
    const response = await request(app).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "a").attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), "large.csv");
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("5 MB");
    const json = await request(app).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "a").send({ csv: " ".repeat(5 * 1024 * 1024 + 1) });
    expect(json.status).toBe(400);
    expect(json.body.message).toContain("5 MB");
    const files = await request(app).post("/api/quick-items/import-csv?scope=services").set("X-Company-Id", "a").attach("unexpected", Buffer.from(text), "wrong.csv");
    expect(files.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
