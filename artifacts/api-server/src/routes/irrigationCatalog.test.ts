import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), history: vi.fn(), import: vi.fn() }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../lib/irrigationCatalog", () => ({ irrigationCatalog: mocks }));
import { registerCatalogRoutes } from "./catalog";
const endpoints = [["get", ""], ["get", "/sync-runs"], ["post", "/import"]] as const;
function appFor(role: string | null = "admin", company: string | null = "a") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { id: "u", activeRole: role, activeCompanyId: company } as Express.User;
    next();
  });
  registerCatalogRoutes(app); return app;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ items: [], categories: [], brands: [] });
  mocks.history.mockResolvedValue([]);
  mocks.import.mockResolvedValue({ run: { status: "success" }, httpStatus: 200 });
});
describe("read-only irrigation routes", () => {
  it.each(endpoints)("guards %s %s for all roles, missing tenant and stale tenant", async (method, path) => {
    for (const role of [null, "field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor", "crew_supervisor"]) {
      expect((await request(appFor(role))[method](`/api/irrigation-catalog${path}`)).status).toBe(role === null ? 401 : 403);
    }
    expect((await request(appFor("admin", null))[method](`/api/irrigation-catalog${path}`)).status).toBe(403);
    expect((await request(appFor("office", "b"))[method](`/api/irrigation-catalog${path}`).set("X-Company-Id", "a")).status).toBe(409);
    Object.values(mocks).forEach(mock => expect(mock).not.toHaveBeenCalled());
  });
  it.each(["admin", "office"])("permits %s, supplies session identity/company and disables HTTP caches", async role => {
    const app = appFor(role, "b");
    const response = await request(app).get("/api/irrigation-catalog?search=%20part%20&category=F&brand=Brand&includeInactive=1").set("X-Company-Id", "b");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(mocks.list).toHaveBeenCalledWith("b", { search: "part", category: "F", brand: "Brand", includeInactive: true });
    expect((await request(app).get("/api/irrigation-catalog/sync-runs")).body).toEqual([]);
    expect(mocks.history).toHaveBeenCalledWith("b", 10);
    expect((await request(app).post("/api/irrigation-catalog/import").attach("file", Buffer.from("csv"), "parts.csv")).body.status).toBe("success");
    expect(mocks.import).toHaveBeenCalledWith("b", "u", "parts.csv", "csv");
  });
  it("bounds filters, history and uploads; no item-level mutations exist", async () => {
    const app = appFor();
    for (const query of ["limit=0", "limit=51", "limit=1.5", "limit=no", "limit=1&limit=2"]) {
      expect((await request(app).get(`/api/irrigation-catalog/sync-runs?${query}`)).status).toBe(400);
    }
    for (const query of ["search[a]=x", "includeInactive=yes", `search=${"a".repeat(501)}`]) {
      expect((await request(app).get(`/api/irrigation-catalog?${query}`)).status).toBe(400);
    }
    expect((await request(app).post("/api/irrigation-catalog/import")).status).toBe(400);
    const big = await request(app).post("/api/irrigation-catalog/import").attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), "big.csv");
    expect(big.status).toBe(400); expect(big.body.message).toContain("5 MB");
    for (const method of ["post", "patch", "delete"] as const) {
      expect((await request(app)[method]("/api/irrigation-catalog/part").send({ name: "Edit" })).status).toBe(404);
    }
    expect(mocks.import).not.toHaveBeenCalled();
  });
  it("returns parse and persistence failures with completed run history data", async () => {
    for (const httpStatus of [400, 500]) {
      const run = { status: "error", errorMessage: "Import failed" };
      mocks.import.mockResolvedValueOnce({ run, httpStatus });
      const response = await request(appFor()).post("/api/irrigation-catalog/import").attach("file", Buffer.from("bad"), "parts.csv");
      expect(response.status).toBe(httpStatus);
      expect(response.body).toEqual({ message: run.errorMessage, run });
    }
  });
});
