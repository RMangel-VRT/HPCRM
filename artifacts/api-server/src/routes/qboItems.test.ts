import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cachedItems: vi.fn(), createItem: vi.fn(), incomeAccounts: vi.fn(), linkItem: vi.fn(), listUmbrellas: vi.fn(),
  pullItems: vi.fn(), unlinkItem: vi.fn(), connection: vi.fn(), writeEnabled: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: { getQboConnection: mocks.connection } }));
vi.mock("../services/qboClient", () => ({ isQboWriteEnabled: mocks.writeEnabled }));
vi.mock("../services/qboItems", async original => {
  const actual = await original<typeof import("../services/qboItems")>();
  return { ...actual, ...mocks };
});
import router from "./qboItems";
import { QboItemError } from "../services/qboItems";
function appFor(role: string | null = "admin", company: string | null = "a") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { activeRole: role, activeCompanyId: company } as Express.User; next();
  });
  app.use("/api/qbo", router); return app;
}
const paths = [["get", "/umbrellas"], ["post", "/items/pull"], ["get", "/items/cache"], ["get", "/items/income-accounts"],
  ["post", "/umbrellas/link"], ["post", "/umbrellas/unlink"], ["post", "/umbrellas/create-in-qbo"]] as const;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue({ status: "connected" }); mocks.writeEnabled.mockResolvedValue(false);
  mocks.listUmbrellas.mockResolvedValue([]); mocks.cachedItems.mockResolvedValue({ items: [], lastPulledAt: null });
  mocks.incomeAccounts.mockResolvedValue([]); mocks.pullItems.mockResolvedValue({ pulled: 0 }); mocks.createItem.mockResolvedValue({ qboId: "new" });
});
describe("all seven umbrella/item endpoint boundaries", () => {
  it.each(paths)("authenticates and scopes %s %s before work", async (method, path) => {
    for (const role of [null, "field", "field_manager", "crew_supervisor", "landscape_supervisor", "mapping", "chemical_manager", "shop_manager", "irrigation_manager"]) {
      expect((await request(appFor(role))[method](`/api/qbo${path}`).send({})).status).toBe(role === null ? 401 : 403);
    }
    expect((await request(appFor("office", null))[method](`/api/qbo${path}`)).status).toBe(403);
    expect((await request(appFor())[method](`/api/qbo${path}`).set("X-Company-Id", "b").send({})).status).toBe(409);
    Object.values(mocks).forEach(mock => expect(mock).not.toHaveBeenCalled());
  });
  it.each(["admin", "office"])("allows %s cached reads and CRM-only bindings with writes disabled and disconnected QBO", async role => {
    mocks.connection.mockResolvedValue(null);
    expect((await request(appFor(role)).get("/api/qbo/umbrellas")).body).toEqual({ items: [], qboWriteEnabled: false });
    expect((await request(appFor(role)).get("/api/qbo/items/cache?search=Plant&type=NonInventory")).status).toBe(200);
    expect(mocks.cachedItems).toHaveBeenCalledWith("a", "Plant", "NonInventory");
    expect((await request(appFor(role)).post("/api/qbo/umbrellas/link").send({ key: "plants", qboItemId: "id" })).status).toBe(200);
    expect(mocks.linkItem).toHaveBeenCalledWith("a", "plants", "id");
    expect((await request(appFor(role)).post("/api/qbo/umbrellas/unlink").send({ key: "plants" })).status).toBe(200);
    expect(mocks.unlinkItem).toHaveBeenCalledWith("a", "plants");
  });
  it("permits QBO reads without write access, but server-gates creation with Settings guidance", async () => {
    expect((await request(appFor("office")).post("/api/qbo/items/pull")).status).toBe(200);
    expect(mocks.pullItems).toHaveBeenCalledWith("a");
    expect((await request(appFor("office")).get("/api/qbo/items/income-accounts")).status).toBe(200);
    const result = await request(appFor("office")).post("/api/qbo/umbrellas/create-in-qbo").send({ key: "plants", name: "Plant", incomeAccountId: "inc" });
    expect(result.status).toBe(403); expect(result.body).toMatchObject({ writeDisabled: true });
    expect(result.body.message).toContain("Settings"); expect(mocks.createItem).not.toHaveBeenCalled();
  });
  it("requires a connection for live operations only", async () => {
    mocks.connection.mockResolvedValue(null);
    for (const [method, path] of [["post", "/items/pull"], ["get", "/items/income-accounts"], ["post", "/umbrellas/create-in-qbo"]] as const) {
      expect((await request(appFor())[method](`/api/qbo${path}`)).status).toBe(503);
    }
  });
  it("validates permanent keys, supported types, income account and immutable company fields", async () => {
    mocks.writeEnabled.mockResolvedValue(true);
    for (const body of [{ key: "unknown" }, { key: "plants", name: "Plant" }, { key: "plants", name: "Plant", incomeAccountId: "inc", type: "Inventory" },
      { key: "plants", name: "Plant", incomeAccountId: "inc", companyId: "other" }]) {
      expect((await request(appFor()).post("/api/qbo/umbrellas/create-in-qbo").send(body)).status).toBe(400);
    }
    expect((await request(appFor()).post("/api/qbo/umbrellas/link").send({ key: "unknown", qboItemId: "x" })).status).toBe(400);
    expect((await request(appFor()).post("/api/qbo/umbrellas/unlink").send({ key: "unknown" })).status).toBe(400);
    expect(mocks.createItem).not.toHaveBeenCalled();
  });
  it("passes defaults through to the service and exposes useful duplicate/recovery errors", async () => {
    mocks.writeEnabled.mockResolvedValue(true);
    const body = { key: "plants", name: " Plants ", incomeAccountId: "inc", type: "" };
    expect((await request(appFor("office")).post("/api/qbo/umbrellas/create-in-qbo").send(body)).status).toBe(200);
    expect(mocks.createItem).toHaveBeenCalledWith("a", { key: "plants", name: "Plants", incomeAccountId: "inc", type: undefined });
    mocks.createItem.mockRejectedValue(new QboItemError(409, "Duplicate", { candidate: { qboId: "id", active: true, type: "Service" }, canLink: true }));
    expect((await request(appFor()).post("/api/qbo/umbrellas/create-in-qbo").send(body)).body).toMatchObject({ canLink: true, candidate: { qboId: "id" } });
    mocks.createItem.mockRejectedValue(new QboItemError(502, "Pull and link", { recoveryRequired: true }));
    expect((await request(appFor()).post("/api/qbo/umbrellas/create-in-qbo").send(body)).body).toMatchObject({ recoveryRequired: true });
  });
});
