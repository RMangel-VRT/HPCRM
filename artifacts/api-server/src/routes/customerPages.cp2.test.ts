import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Execute the real registrations without running unrelated startup jobs, as in
// customerBilling.test.ts. These tests do not substitute a parallel HTTP policy.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.get("/api/customers/:id/parent-rollup",');
const end = source.indexOf('  app.post("/api/customers",', start);
if (start < 0 || end < 0) throw new Error("Parent rollup registration not found");
const mount = new Function("app", "storage", "db", "customerContractProjector", "loadCustomerContractInputs",
  transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code);
const patchStart = source.indexOf('  app.patch("/api/customers/:id",');
const patchEnd = source.indexOf('  app.delete("/api/customers/:id",', patchStart);
if (patchStart < 0 || patchEnd < 0) throw new Error("Customer PATCH registration not found");
const mountPatch = new Function("app", "storage",
  transformSync(source.slice(patchStart, patchEnd), { loader: "ts", target: "es2022" }).code);
const storage = {
  getCustomerById: vi.fn(), getChildCustomers: vi.fn(), getAllTicketTypeStatuses: vi.fn(),
  getTicketsByCustomerId: vi.fn(), getCommunications: vi.fn(), getTicketStatusHistoryForTickets: vi.fn(),
};
const load = vi.fn();
let app: ReturnType<typeof express>;
let role: string, authenticated: boolean;
beforeEach(() => {
  vi.resetAllMocks();
  role = "admin"; authenticated = true;
  storage.getCustomerById.mockResolvedValue({ id: "parent", isParent: "true" });
  storage.getChildCustomers.mockResolvedValue([{ id: "branch", name: "Branch" }]);
  storage.getAllTicketTypeStatuses.mockResolvedValue([{ id: "closed", isFinal: "true" }]);
  storage.getTicketsByCustomerId.mockResolvedValue([{ id: "ticket", title: "Work", currentStatusId: "open", completedAt: null }]);
  storage.getTicketStatusHistoryForTickets.mockResolvedValue([]);
  storage.getCommunications.mockResolvedValue([{ id: "mail", subject: "Privileged email", type: "email",
    sentAt: new Date(), createdAt: new Date() }]);
  load.mockResolvedValue({});
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as any;
    req.user = { activeCompanyId: "company", activeRole: role === "admin" ? "account_manager" : role, accessRole: role } as any;
    next();
  });
  mount(app, storage, {}, () => () => ({ current: [
    { agreementId: "a", termId: "term", annualCents: 12300, parentCustomerId: "parent",
      label: "2026–27", line: "both", startDate: "2026-11-01", endDate: "2027-10-31" },
  ] }), load);
  mountPatch(app, storage);
});
describe("CP2 Property location mutation boundary", () => {
  it.each(["field_manager", "chemical_manager", "field", "irrigation_manager", "landscape_supervisor", "mapping", "shop_manager", "crew_supervisor"])(
    "rejects supplied location changes for %s before reading/writing facts", async accessRole => {
      role = accessRole;
      for (const body of [{ locationLat: 40 }, { locationLng: -105 }, { locationLat: null, locationLng: null }]) {
        await request(app).patch("/api/customers/property").send(body).expect(403);
      }
      expect(storage.getCustomerById).not.toHaveBeenCalled();
    });
});
describe("CP2 parent shared-frame reads", () => {
  it("rejects stale company and signed-out reads before loading customer facts", async () => {
    await request(app).get("/api/customers/parent/parent-rollup").set("X-Company-Id", "old").expect(409);
    authenticated = false;
    await request(app).get("/api/customers/parent/parent-rollup").expect(401);
    expect(storage.getCustomerById).not.toHaveBeenCalled();
  });
  it.each(["field_manager", "chemical_manager", "field", "irrigation_manager", "landscape_supervisor", "mapping"])(
    "does not query commercial rows or email for %s", async accessRole => {
      role = accessRole;
      const r = await request(app).get("/api/customers/parent/parent-rollup").expect(200);
      expect(load).toHaveBeenCalledWith({}, "company", false);
      expect(storage.getCommunications).not.toHaveBeenCalled();
      expect(r.body.children[0]).toMatchObject({ openTickets: 1, annualRevenue: null, lastCommunication: null });
      expect(r.body.children[0].currentTerms).toEqual([
        { label: "2026–27", line: "both", startDate: "2026-11-01", endDate: "2027-10-31" },
      ]);
      expect(r.body.recentActivity).toEqual([]);
    });
  it.each(["admin", "office"])("preserves privileged activity for projected %s access", async accessRole => {
    role = accessRole;
    const r = await request(app).get("/api/customers/parent/parent-rollup").expect(200);
    expect(load).toHaveBeenCalledWith({}, "company", true);
    expect(storage.getCommunications).toHaveBeenCalledWith("company", { customerId: "branch" });
    expect(r.body.recentActivity[0].title).toBe("Privileged email");
    // Inherited agreement value is never allocated to a branch.
    expect(r.body.children[0].annualRevenue).toBeNull();
  });
});
