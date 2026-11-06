import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  storage: { getCustomerById: vi.fn(), getTicketsByCustomerId: vi.fn(), getTicketStatusHistoryForTickets: vi.fn(), getCommunications: vi.fn() },
  resolve: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: fx.storage }));
vi.mock("../services/mailboxScope", () => ({
  resolveVisibleMailboxes: fx.resolve,
  MailboxScopeForbiddenError: class extends Error {},
}));
import { registerCustomerDashboardRoutes } from "./customerDashboard";

let app: ReturnType<typeof express>;
let role = "admin", authenticated = true;
const at = (s: string) => new Date(`2026-11-${s}T12:00:00Z`);
const mail = (id: string, more = {}) => ({ id, status: "sent", subject: id, direction: "outbound",
  sentAt: at("01"), createdAt: at("01"), mailboxAccountId: "m1", type: "email", sentByName: "Office", ...more });
beforeEach(() => {
  vi.resetAllMocks(); role = "admin"; authenticated = true;
  fx.resolve.mockResolvedValue({ mailboxIds: ["m1"], includeNullMailbox: false, scopeLabel: "Chosen mailbox" });
  fx.storage.getCustomerById.mockResolvedValue({ id: "c" });
  fx.storage.getTicketsByCustomerId.mockResolvedValue([
    { id: "t", title: "Real ticket", assignedToId: "u" }, { id: "other", title: "Other ticket", assignedToId: "someone" },
  ]);
  fx.storage.getTicketStatusHistoryForTickets.mockResolvedValue([
    { id: "h", ticketId: "t", createdAt: at("02") },
  ]);
  fx.storage.getCommunications.mockResolvedValue([
    mail("sent"), mail("draft", { status: "draft" }), mail("failed", { status: "failed" }),
    mail("received", { direction: "inbound", receivedAt: at("03"), fromName: "Customer" }),
    mail("logged", { mailboxAccountId: null, type: "note", sentAt: at("04") }),
  ]);
  app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as any;
    req.user = { id: "u", activeCompanyId: "co", activeRole: role, accessRole: role === "account_manager" ? "admin" : role } as any;
    next();
  });
  registerCustomerDashboardRoutes(app);
});
describe("CP3 actual dashboard activity read", () => {
  it("rejects signed-out, stale company and cross-company/missing customers", async () => {
    authenticated = false;
    await request(app).get("/api/customers/c/dashboard-activity").expect(401);
    authenticated = true;
    await request(app).get("/api/customers/c/dashboard-activity").set("X-Company-Id", "old").expect(409);
    expect(fx.storage.getCustomerById).not.toHaveBeenCalled();
    fx.storage.getCustomerById.mockResolvedValue(undefined);
    await request(app).get("/api/customers/not-in-company/dashboard-activity").expect(404);
    expect(fx.storage.getCustomerById).toHaveBeenCalledWith("not-in-company", "co");
  });
  it.each(["admin", "office", "account_manager"])("%s reads actual contacts and real ticket history in scope", async r => {
    role = r;
    const response = await request(app).get("/api/customers/c/dashboard-activity?viewAs=m1").expect(200);
    expect(fx.resolve).toHaveBeenCalledWith(expect.objectContaining({ userId: "u", companyId: "co", role: r, viewAs: "m1" }));
    expect(fx.storage.getCommunications).toHaveBeenCalledWith("co", { customerId: "c" },
      { mailboxIds: ["m1"], includeNullMailbox: false, scopeLabel: "Chosen mailbox" });
    expect(response.body.communications.map((c: any) => c.id)).toEqual(["logged", "received", "sent"]);
    expect(response.body.communications[1]).toMatchObject({ person: "Customer", at: at("03").toISOString(), direction: "inbound" });
    expect(response.body.ticketChanges).toEqual([{ id: "h", ticketId: "t", title: "Real ticket", at: at("02").toISOString() }]);
  });
  it("mailboxIds can only narrow the already-authorized storage result", async () => {
    const response = await request(app).get("/api/customers/c/dashboard-activity?mailboxIds=m1").expect(200);
    expect(response.body.communications.map((c: any) => c.id)).toEqual(["received", "sent"]);
    const empty = await request(app).get("/api/customers/c/dashboard-activity?mailboxIds=").expect(200);
    expect(empty.body.communications).toEqual([]);
  });
  it.each(["field", "field_manager", "chemical_manager", "mapping", "landscape_supervisor", "crew_supervisor"])(
    "%s never queries or receives mailbox data", async r => {
      role = r;
      const response = await request(app).get("/api/customers/c/dashboard-activity").expect(200);
      expect(response.body.communications).toEqual([]);
      expect(fx.resolve).not.toHaveBeenCalled();
      expect(fx.storage.getCommunications).not.toHaveBeenCalled();
      if (r === "crew_supervisor") expect(fx.storage.getTicketStatusHistoryForTickets).toHaveBeenCalledWith(["t"]);
    });
  it("rejects array mailbox parameters", async () => {
    await request(app).get("/api/customers/c/dashboard-activity?viewAs=x&viewAs=y").expect(400);
  });
});
