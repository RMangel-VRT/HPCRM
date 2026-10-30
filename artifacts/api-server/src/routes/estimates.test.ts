import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  createEstimate: vi.fn(), retitleEstimate: vi.fn(), createSection: vi.fn(), patchSection: vi.fn(), deleteSection: vi.fn(),
  createLine: vi.fn(), patchLine: vi.fn(), deleteLine: vi.fn(), readEstimate: vi.fn(), listEstimates: vi.fn(), log: vi.fn(),
  readTicketEstimate: vi.fn(),
}));
vi.mock("../services/estimates", () => mocks);
vi.mock("../services/estimateReads", () => mocks);
vi.mock("../services/ticketEstimates", () => mocks);
vi.mock("../lib/logger", () => ({ logger: { error: mocks.log } }));
import { registerEstimateRoutes } from "./estimates";
import { EstimateError } from "../services/estimateErrors";

const custom = { sectionId: "s", quantity: "1", lineType: "custom", name: "Line", unit: "ea", unitPriceCents: 0, umbrellaKey: "plants" };
const endpoints = [
  ["get", "/api/estimates", {}, "listEstimates"],
  ["get", "/api/estimates/by-ticket/ticket", {}, "readTicketEstimate"],
  ["post", "/api/estimates", { customerId: "c", title: "T" }, "createEstimate"],
  ["get", "/api/estimates/e", {}, "readEstimate"],
  ["patch", "/api/estimates/e", { title: "T" }, "retitleEstimate"],
  ["post", "/api/estimates/e/versions/v/sections", { name: "S" }, "createSection"],
  ["patch", "/api/estimates/e/versions/v/sections/s", { name: "S" }, "patchSection"],
  ["delete", "/api/estimates/e/versions/v/sections/s", {}, "deleteSection"],
  ["post", "/api/estimates/e/versions/v/lines", custom, "createLine"],
  ["patch", "/api/estimates/e/versions/v/lines/l", { quantity: "2" }, "patchLine"],
  ["delete", "/api/estimates/e/versions/v/lines/l", {}, "deleteLine"],
] as const;
function appFor(role: string | null = "admin", company: string | null = "a") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { id: "actor", activeRole: role, activeCompanyId: company } as Express.User; next();
  });
  registerEstimateRoutes(app); return app;
}
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, fn] of Object.entries(mocks)) if (key !== "log") fn.mockResolvedValue({ id: "e", version: { totals: { subtotalCents: 0 } } });
});
describe("all estimate endpoint boundaries", () => {
  it("keeps by-ticket separate from list/dynamic ID reads and returns null for no live estimate", async () => {
    mocks.readTicketEstimate.mockResolvedValue(null);
    expect((await request(appFor()).get("/api/estimates/by-ticket/ticket").set("X-Company-Id", "a")).body).toBeNull();
    expect(mocks.readTicketEstimate).toHaveBeenCalledWith("a", "ticket");
    expect(mocks.readEstimate).not.toHaveBeenCalled();
    expect(mocks.listEstimates).not.toHaveBeenCalled();
    mocks.readTicketEstimate.mockRejectedValue(new EstimateError(404, "NOT_FOUND"));
    expect((await request(appFor()).get("/api/estimates/by-ticket/foreign")).status).toBe(404);
  });
  it.each(endpoints)("gates role/auth/company/expectation on %s %s", async (method, url, body, service) => {
    for (const role of [null, "field", "field_manager", "landscape_supervisor", "crew_supervisor", "chemical_manager", "irrigation_manager", "shop_manager", "mapping"]) {
      const result = await request(appFor(role))[method](url).send(body);
      expect(result.status).toBe(role === null ? 401 : 403);
      expect(result.headers["cache-control"]).toBe("no-store");
    }
    expect((await request(appFor("admin", null))[method](url).send(body)).status).toBe(403);
    expect((await request(appFor())[method](url).set("X-Company-Id", "b").send(body)).status).toBe(409);
    expect(mocks[service]).not.toHaveBeenCalled();
    for (const role of ["admin", "office"]) {
      const response = await request(appFor(role))[method](url).set("X-Company-Id", "a").send(body);
      expect(response.status).toBe(method === "post" ? 201 : 200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(mocks[service].mock.calls.at(-1)?.[0]).toBe("a");
    }
  });
  it.each(endpoints)("preserves known domain conflicts and cleans unique errors on %s %s", async (method, url, body, service) => {
    mocks[service].mockRejectedValue(new EstimateError(409, "VERSION_LOCKED"));
    const conflict = await request(appFor())[method](url).send(body);
    expect(conflict.status).toBe(409); expect(conflict.body).toEqual({ error: "VERSION_LOCKED" });
    mocks[service].mockRejectedValue({ cause: { code: "23505", detail: "PRIVATE" } });
    const unique = await request(appFor())[method](url).send(body);
    expect(unique.status).toBe(409); expect(unique.body).toEqual({ error: "CONFLICT" });
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it.each(endpoints)("logs only safe codes and returns generic 500 on %s %s", async (method, url, body, service) => {
    mocks[service].mockRejectedValue({ code: "XX000", message: "PRIVATE", detail: "PRIVATE", request: body });
    const result = await request(appFor())[method](url).send(body);
    expect(result.status).toBe(500); expect(result.body).toEqual({ error: "INTERNAL_ERROR" });
    expect(mocks.log).toHaveBeenCalledWith({ code: "XX000" }, "Estimate request failed");
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("PRIVATE");
  });
  it("does not allow arbitrary error codes to leak messages", async () => {
    mocks.listEstimates.mockRejectedValue({ code: "PRIVATE_ERROR_WITH_DATA" });
    await request(appFor()).get("/api/estimates");
    expect(mocks.log).toHaveBeenCalledWith({ code: "ESTIMATE_ERROR" }, "Estimate request failed");
  });
  it("preserves the ticket-specific duplicate ID", async () => {
    mocks.createEstimate.mockRejectedValue(new EstimateError(409, "ESTIMATE_EXISTS", { existingEstimateId: "existing" }));
    const result = await request(appFor()).post("/api/estimates").send({ customerId: "c", title: "T", ticketId: "ticket" });
    expect(result.status).toBe(409); expect(result.body.existingEstimateId).toBe("existing");
  });
  it("rejects empty, unknown and lifecycle PATCH fields without calling writes", async () => {
    const app = appFor();
    for (const body of [{}, { status: "sent" }, { title: "x", estimateNumber: "EST-1" }, { voidedAt: null }])
      expect((await request(app).patch("/api/estimates/e").send(body)).status).toBe(400);
    for (const url of ["/api/estimates/e/versions/v/sections/s", "/api/estimates/e/versions/v/lines/l"]) {
      expect((await request(app).patch(url).send({})).status).toBe(400);
      expect((await request(app).patch(url).send({ status: "sent" })).status).toBe(400);
    }
    expect(mocks.retitleEstimate).not.toHaveBeenCalled(); expect(mocks.patchLine).not.toHaveBeenCalled(); expect(mocks.patchSection).not.toHaveBeenCalled();
  });
  it("passes only explicit PATCH values, retaining explicit nullable clears", async () => {
    await request(appFor()).patch("/api/estimates/e/versions/v/lines/l").send({ detail: null });
    expect(mocks.patchLine).toHaveBeenCalledWith("a", "e", "v", "l", { detail: null });
    await request(appFor()).patch("/api/estimates/e/versions/v/sections/s").send({ name: "Renamed" });
    expect(mocks.patchSection).toHaveBeenCalledWith("a", "e", "v", "s", { name: "Renamed" });
  });
  it("validates query contracts and historical version numbers", async () => {
    for (const url of ["/api/estimates?includeVoid=1", "/api/estimates?customerId=", "/api/estimates?extra=1", "/api/estimates/e?version=0", "/api/estimates/e?version=2147483648", "/api/estimates/e?version=2.5"])
      expect((await request(appFor()).get(url)).status).toBe(400);
    await request(appFor()).get("/api/estimates/e?version=2");
    expect(mocks.readEstimate).toHaveBeenCalledWith("a", "e", 2);
  });
});
