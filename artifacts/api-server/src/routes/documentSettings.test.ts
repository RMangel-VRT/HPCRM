import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readDocumentSettings: vi.fn(), updateDocumentSettings: vi.fn(), log: vi.fn() }));
vi.mock("../services/documentSettings", () => mocks);
vi.mock("../lib/logger", () => ({ logger: { error: mocks.log } }));
import { registerDocumentSettingsRoutes } from "./documentSettings";
function appFor(role: string | null = "admin", company: string | null = "a") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { id: "actor", activeRole: role, activeCompanyId: company } as Express.User; next();
  });
  registerDocumentSettingsRoutes(app); return app;
}
beforeEach(() => { vi.resetAllMocks(); mocks.readDocumentSettings.mockResolvedValue({ phone: "a" }); mocks.updateDocumentSettings.mockResolvedValue({ phone: "new" }); });
describe("admin document settings", () => {
  it.each(["get", "patch"] as const)("guards %s auth/role/company and sets no-store even on errors", async method => {
    for (const role of [null, "office", "field_manager", "crew_supervisor"]) {
      const response = await request(appFor(role))[method]("/api/settings/documents").send({ phone: "new" });
      expect(response.status).toBe(role === null ? 401 : 403); expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect((await request(appFor("admin", null))[method]("/api/settings/documents")).status).toBe(403);
    expect((await request(appFor())[method]("/api/settings/documents").set("X-Company-Id", "b")).status).toBe(409);
    expect(mocks.readDocumentSettings).not.toHaveBeenCalled(); expect(mocks.updateDocumentSettings).not.toHaveBeenCalled();
  });
  it("binds reads and writes to the session company and preserves omitted fields", async () => {
    expect((await request(appFor()).get("/api/settings/documents")).status).toBe(200);
    expect(mocks.readDocumentSettings).toHaveBeenCalledWith("a");
    expect((await request(appFor("admin", "b")).patch("/api/settings/documents").send({ phone: "" })).status).toBe(200);
    expect(mocks.updateDocumentSettings).toHaveBeenCalledWith("b", "actor", { phone: "" });
  });
  it.each([{}, { companyId: "b", phone: "bad" }, { companyName: "duplicate" }, { updatedById: "forged" }, { warrantyText: "a".repeat(8001) }])("rejects invalid/server-owned fields", async body => {
    expect((await request(appFor()).patch("/api/settings/documents").send(body)).status).toBe(400);
    expect(mocks.updateDocumentSettings).not.toHaveBeenCalled();
  });
  it("returns sanitized failures and logs no customer fields", async () => {
    mocks.readDocumentSettings.mockRejectedValue(new Error("private SQL data"));
    expect((await request(appFor()).get("/api/settings/documents")).body).toEqual({ error: "INTERNAL_ERROR" });
    expect(mocks.log).toHaveBeenCalledExactlyOnceWith("DOCUMENT_SETTINGS_READ_FAILED");
  });
});
