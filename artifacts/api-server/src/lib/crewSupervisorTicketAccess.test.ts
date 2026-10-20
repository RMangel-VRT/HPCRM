import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCrewSupervisorTicketGuard } from "./crewSupervisorTicketAccess";

let user: { id: string; activeRole: string; activeCompanyId: string; activeTags: string[] };
const storage = { getTicketById: vi.fn() };
function fixture() {
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as any;
    req.user = user as any;
    next();
  });
  registerCrewSupervisorTicketGuard(app, storage);
  app.use((_req, res) => { res.json({ reachedHandler: true }); });
  return app;
}
beforeEach(() => {
  user = { id: "owner", activeRole: "crew_supervisor", activeCompanyId: "company", activeTags: [] };
  storage.getTicketById.mockReset().mockResolvedValue({ companyId: "company", assignedToId: "owner" });
});
describe("crew supervisor web ticket subtree boundary", () => {
  it.each([
    ["get", ""], ["get", "/details"], ["patch", ""],
    ["get", "/comments"], ["post", "/comments"], ["put", "/field-values/field"],
    ["get", "/photo-urls"], ["get", "/mobile-photos"], ["get", "/mobile-notes"],
    ["get", "/work-items"], ["patch", "/work-items/item"], ["get", "/links"],
    ["get", "/crew-worksheets"], ["get", "/proposals"], ["post", "/accept"],
  ] as const)("allows assigned %s %s and blocks a different assignee before its handler", async (method, suffix) => {
    const app = fixture();
    expect((await request(app)[method](`/api/tickets/job${suffix}`)).status).toBe(200);
    storage.getTicketById.mockResolvedValue({ companyId: "company", assignedToId: "other" });
    const denied = await request(app)[method](`/api/tickets/job${suffix}`);
    expect(denied.status).toBe(403);
    expect(denied.body.reachedHandler).toBeUndefined();
    expect(storage.getTicketById).toHaveBeenCalledWith("job", "company");
  });
  it.each([{ companyId: "foreign", assignedToId: "owner" }, undefined])("hides foreign or absent tickets", async ticket => {
    storage.getTicketById.mockResolvedValue(ticket);
    expect((await request(fixture()).get("/api/tickets/job/details")).status).toBe(404);
  });
  it("billing tags cannot bypass the assigned-ticket boundary", async () => {
    user.activeTags = ["billing"];
    storage.getTicketById.mockResolvedValue({ companyId: "company", assignedToId: "other" });
    expect((await request(fixture()).patch("/api/tickets/job")).status).toBe(403);
  });
  it.each(["my", "batch", "photo-upload-url", "document-upload-url", "create-invoice-from-project"])("leaves existing collection action %s alone", async path => {
    expect((await request(fixture()).post(`/api/tickets/${path}`)).status).toBe(200);
    expect(storage.getTicketById).not.toHaveBeenCalled();
  });
  it("does not exempt a child route under a reserved collection name", async () => {
    storage.getTicketById.mockResolvedValue(undefined);
    expect((await request(fixture()).get("/api/tickets/my/details")).status).toBe(404);
  });
  it.each(["admin", "office", "field_manager", "chemical_manager", "irrigation_manager", "field", "shop_manager", "landscape_supervisor", "mapping"])("leaves %s authorization unchanged", async role => {
    user.activeRole = role;
    expect((await request(fixture()).get("/api/tickets/job/details")).status).toBe(200);
    expect(storage.getTicketById).not.toHaveBeenCalled();
  });
  it("does not intercept native-mobile paths", async () => {
    expect((await request(fixture()).get("/api/m/tickets/job")).status).toBe(200);
    expect(storage.getTicketById).not.toHaveBeenCalled();
  });
});
